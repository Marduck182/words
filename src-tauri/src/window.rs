//! La ventana flotante: dónde se coloca, cómo se muestra y oculta, y el atajo global.

use crate::commands::AppDb;
use crate::db;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Un rectángulo en píxeles físicos (el área útil de un monitor).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Area {
    fn contains(&self, px: i32, py: i32) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }
}

/// Devuelve la posición guardada solo si el punto por donde se agarra la ventana para arrastrarla
/// (centro de su borde superior) sigue dentro de alguna pantalla; si se desconectó un monitor, `None`.
pub fn restore_position(saved: Option<(i32, i32)>, width: i32, areas: &[Area]) -> Option<(i32, i32)> {
    let (x, y) = saved?;
    let (grab_x, grab_y) = (x + width / 2, y + 16);
    areas.iter().any(|a| a.contains(grab_x, grab_y)).then_some((x, y))
}

/// Centrada horizontalmente y al 18 % desde arriba, como el lanzador de sf-org.
pub fn centered_on(area: Area, width: i32) -> (i32, i32) {
    (area.x + (area.w - width) / 2, area.y + (f64::from(area.h) * 0.18) as i32)
}

/// Tamaño mínimo (lógico) de la ventana; debe coincidir con `minWidth`/`minHeight` de tauri.conf.json.
pub const MIN_SIZE: (u32, u32) = (420, 420);

/// El tamaño guardado, acotado entre el mínimo y el área útil del monitor (si cambió de monitor o de
/// escala, no puede quedar más grande que la pantalla ni más chico que el mínimo). `None` si no hay guardado.
pub fn clamp_size(saved: Option<(u32, u32)>, min: (u32, u32), area: Area) -> Option<(u32, u32)> {
    let (w, h) = saved?;
    let max_w = (area.w.max(0) as u32).max(min.0);
    let max_h = (area.h.max(0) as u32).max(min.1);
    Some((w.clamp(min.0, max_w), h.clamp(min.1, max_h)))
}

/// Agrupa ráfagas de avisos (arrastrar el borde de la ventana dispara cientos): tras el primer aviso
/// espera `delay` y ejecuta la acción UNA vez, así lo que se guarda es el estado final y no uno intermedio.
pub struct Trailing {
    pending: Arc<AtomicBool>,
    delay: Duration,
}

impl Trailing {
    pub fn new(delay: Duration) -> Self {
        Self { pending: Arc::new(AtomicBool::new(false)), delay }
    }

    pub fn trigger<F: FnOnce() + Send + 'static>(&self, action: F) {
        // Si ya hay uno en espera, ese aviso también cubre este cambio.
        if self.pending.swap(true, Ordering::SeqCst) {
            return;
        }
        let (pending, delay) = (self.pending.clone(), self.delay);
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            pending.store(false, Ordering::SeqCst); // un cambio posterior inicia otra espera
            action();
        });
    }
}

impl Default for Trailing {
    fn default() -> Self {
        Self::new(Duration::from_millis(500))
    }
}

// ── Estado y ventana (Tauri) ──────────────────────────────────────────────────

#[derive(Default)]
pub struct WinState {
    /// Cuándo se ocultó la ventana por perder el foco: el clic en la bandeja la desenfoca justo antes
    /// de llegar, y sin esto se volvería a abrir al instante.
    last_blur_hide: Mutex<Option<Instant>>,
    /// Guarda posición y tamaño poco después del último movimiento o cambio de tamaño.
    geometry: Trailing,
    /// `false` si otra app ya tenía el atajo y no se pudo registrar.
    pub hotkey_ok: AtomicBool,
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn area_of(rect: &tauri::PhysicalRect<i32, u32>) -> Area {
    Area { x: rect.position.x, y: rect.position.y, w: rect.size.width as i32, h: rect.size.height as i32 }
}

/// Pone la ventana donde el usuario la dejó (si esa zona sigue existiendo) o centrada en el monitor del cursor.
fn place(app: &AppHandle, win: &WebviewWindow) {
    let (saved_pos, saved_size) = match app.state::<AppDb>().0.lock() {
        Ok(c) => (db::load_window_position(&c), db::load_window_size(&c)),
        Err(_) => (None, None),
    };
    let areas: Vec<Area> =
        win.available_monitors().unwrap_or_default().iter().map(|m| area_of(m.work_area())).collect();

    // El tamaño recordado, acotado al mínimo y a la pantalla más grande disponible.
    let biggest = areas.iter().copied().max_by_key(|a| i64::from(a.w) * i64::from(a.h));
    if let (Some(biggest), Ok(scale)) = (biggest, win.scale_factor()) {
        let min = ((f64::from(MIN_SIZE.0) * scale).round() as u32, (f64::from(MIN_SIZE.1) * scale).round() as u32);
        if let Some((w, h)) = clamp_size(saved_size, min, biggest) {
            let _ = win.set_size(PhysicalSize::new(w, h));
        }
    }

    let width = win.outer_size().map(|s| s.width as i32).unwrap_or(480);
    if let Some((x, y)) = restore_position(saved_pos, width, &areas) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
        return;
    }

    let Ok(cursor) = win.cursor_position() else { return };
    let monitor = win
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let (x, y) = centered_on(area_of(monitor.work_area()), width);
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Guarda la posición y el tamaño actuales para la próxima vez que se muestre la ventana.
pub fn save_geometry(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let state = app.state::<AppDb>();
    let Ok(conn) = state.0.lock() else { return };
    if let Ok(pos) = win.outer_position() {
        let _ = db::save_window_position(&conn, pos.x, pos.y);
    }
    if let Ok(size) = win.inner_size() {
        if size.width > 0 && size.height > 0 {
            let _ = db::save_window_size(&conn, size.width, size.height);
        }
    }
}

pub fn show_main(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    place(app, &win);
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    let _ = win.emit("window:show", ());
}

pub fn hide_main(app: &AppHandle) {
    save_geometry(app);
    if let Some(win) = main_window(app) {
        let _ = win.hide();
    }
}

pub fn toggle_main(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    if win.is_visible().unwrap_or(false) {
        hide_main(app);
        return;
    }
    let recently_hidden = app
        .state::<WinState>()
        .last_blur_hide
        .lock()
        .ok()
        .and_then(|t| *t)
        .is_some_and(|t| t.elapsed() < Duration::from_millis(300));
    if !recently_hidden {
        show_main(app);
    }
}

fn hide_on_blur(app: &AppHandle) -> bool {
    app.state::<AppDb>()
        .0
        .lock()
        .ok()
        .and_then(|c| db::get_settings(&c).ok())
        .is_some_and(|s| s.get("hide_on_blur").is_some_and(|v| v == "1"))
}

/// Cerrar la ventana la esconde (la app sigue en la bandeja); moverla o cambiarle el tamaño lo recuerda.
pub fn setup_window(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Focused(false) if hide_on_blur(&handle) => {
            hide_main(&handle);
            if let Ok(mut t) = handle.state::<WinState>().last_blur_hide.lock() {
                *t = Some(Instant::now());
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_main(&handle);
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let saver = handle.clone();
            handle.state::<WinState>().geometry.trigger(move || save_geometry(&saver));
        }
        _ => {}
    });
}

pub fn register_hotkey(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    app.global_shortcut().register(accelerator).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area { x: 0, y: 0, w: 1920, h: 1040 };
    const LEFT: Area = Area { x: -1920, y: 0, w: 1920, h: 1040 };

    #[test]
    fn keeps_a_saved_position_whose_grab_point_is_on_screen() {
        assert_eq!(restore_position(Some((100, 50)), 480, &[SCREEN]), Some((100, 50)));
    }

    #[test]
    fn drops_a_position_that_is_off_every_screen() {
        assert_eq!(restore_position(Some((5000, 50)), 480, &[SCREEN]), None);
        assert_eq!(restore_position(Some((100, 3000)), 480, &[SCREEN]), None);
    }

    #[test]
    fn keeps_a_position_on_a_second_monitor_with_negative_coordinates() {
        assert_eq!(restore_position(Some((-1500, 100)), 480, &[SCREEN, LEFT]), Some((-1500, 100)));
    }

    #[test]
    fn drops_that_position_once_the_second_monitor_is_gone() {
        assert_eq!(restore_position(Some((-1500, 100)), 480, &[SCREEN]), None);
    }

    #[test]
    fn has_nothing_to_restore_without_a_saved_position() {
        assert_eq!(restore_position(None, 480, &[SCREEN]), None);
    }

    #[test]
    fn centered_is_in_the_middle_horizontally_and_near_the_top() {
        assert_eq!(centered_on(SCREEN, 480), (720, 187));
        assert_eq!(centered_on(LEFT, 480), (-1920 + 720, 187));
    }

    #[test]
    fn clamp_keeps_a_size_that_already_fits() {
        assert_eq!(clamp_size(Some((600, 700)), (420, 420), SCREEN), Some((600, 700)));
    }

    #[test]
    fn clamp_raises_a_size_below_the_minimum() {
        assert_eq!(clamp_size(Some((100, 300)), (420, 420), SCREEN), Some((420, 420)));
    }

    #[test]
    fn clamp_shrinks_a_size_larger_than_the_screen() {
        assert_eq!(clamp_size(Some((5000, 3000)), (420, 420), SCREEN), Some((1920, 1040)));
    }

    #[test]
    fn clamp_never_goes_below_the_minimum_even_on_a_tiny_screen() {
        let tiny = Area { x: 0, y: 0, w: 300, h: 300 };
        assert_eq!(clamp_size(Some((500, 500)), (420, 420), tiny), Some((420, 420)));
    }

    #[test]
    fn clamp_has_nothing_without_a_saved_size() {
        assert_eq!(clamp_size(None, (420, 420), SCREEN), None);
    }

    use std::sync::atomic::AtomicUsize;

    fn wait(ms: u64) {
        std::thread::sleep(Duration::from_millis(ms));
    }

    #[test]
    fn trailing_collapses_a_burst_into_one_action() {
        let t = Trailing::new(Duration::from_millis(30));
        let runs = Arc::new(AtomicUsize::new(0));
        for _ in 0..50 {
            let runs = runs.clone();
            t.trigger(move || {
                runs.fetch_add(1, Ordering::SeqCst);
            });
        }
        wait(250);
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn trailing_runs_again_for_a_later_burst() {
        let t = Trailing::new(Duration::from_millis(30));
        let runs = Arc::new(AtomicUsize::new(0));
        for _ in 0..2 {
            let runs = runs.clone();
            t.trigger(move || {
                runs.fetch_add(1, Ordering::SeqCst);
            });
            wait(200);
        }
        assert_eq!(runs.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn trailing_waits_before_running_and_sees_the_state_at_that_moment() {
        let t = Trailing::new(Duration::from_millis(80));
        let state = Arc::new(AtomicUsize::new(1));
        let seen = Arc::new(AtomicUsize::new(0));
        {
            let (state, seen) = (state.clone(), seen.clone());
            t.trigger(move || seen.store(state.load(Ordering::SeqCst), Ordering::SeqCst));
        }
        assert_eq!(seen.load(Ordering::SeqCst), 0, "todavía no se ejecutó");
        state.store(2, Ordering::SeqCst); // el estado sigue cambiando durante la espera
        wait(300);
        assert_eq!(seen.load(Ordering::SeqCst), 2, "guarda el estado final, no el del primer aviso");
    }
}
