//! Comandos de Tauri: capa delgada sobre `db`. La lógica y sus tests viven en `db.rs`.

use crate::db::{self, DbResult, LotSummary, LotView, Stats, Today, Word};
use crate::window::{self, WinState};
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub struct AppDb(pub Mutex<Connection>);

fn with_conn<T>(state: &State<AppDb>, f: impl FnOnce(&Connection, &str) -> DbResult<T>) -> DbResult<T> {
    let conn = state.0.lock().map_err(|_| "La base de datos quedó bloqueada".to_string())?;
    let today = db::today(&conn)?;
    f(&conn, &today)
}

#[tauri::command]
pub fn get_today(state: State<AppDb>, advance: Option<bool>) -> DbResult<Today> {
    with_conn(&state, |c, today| db::get_today(c, today, advance.unwrap_or(false)))
}

#[tauri::command]
pub fn record_answer(state: State<AppDb>, word_id: i64, correct: bool) -> DbResult<()> {
    with_conn(&state, |c, today| db::record_answer(c, today, word_id, correct))
}

#[tauri::command]
pub fn complete_lot(state: State<AppDb>, lot: i64) -> DbResult<()> {
    with_conn(&state, |c, today| db::complete_lot(c, today, lot))
}

#[tauri::command]
pub fn get_hard_words(state: State<AppDb>) -> DbResult<Vec<Word>> {
    with_conn(&state, |c, _| db::get_hard_words(c))
}

#[tauri::command]
pub fn get_all_words(state: State<AppDb>) -> DbResult<Vec<Word>> {
    with_conn(&state, |c, _| db::get_all_words(c))
}

#[tauri::command]
pub fn set_hard(state: State<AppDb>, word_id: i64, hard: bool) -> DbResult<()> {
    with_conn(&state, |c, today| db::set_hard(c, today, word_id, hard))
}

#[tauri::command]
pub fn get_stats(state: State<AppDb>) -> DbResult<Stats> {
    with_conn(&state, |c, _| db::get_stats(c))
}

#[tauri::command]
pub fn get_lot_list(state: State<AppDb>) -> DbResult<Vec<LotSummary>> {
    with_conn(&state, |c, _| db::get_lot_list(c))
}

#[tauri::command]
pub fn select_lot(state: State<AppDb>, start_id: i64, end_id: i64) -> DbResult<Today> {
    with_conn(&state, |c, today| db::select_lot(c, today, start_id, end_id))
}

#[tauri::command]
pub fn start_random_lot(state: State<AppDb>) -> DbResult<Today> {
    with_conn(&state, |c, today| db::start_random_lot(c, today))
}

#[tauri::command]
pub fn get_lot_view(state: State<AppDb>, start_id: i64, end_id: i64) -> DbResult<LotView> {
    with_conn(&state, |c, _| db::get_lot_view(c, start_id, end_id))
}

#[tauri::command]
pub fn get_settings(state: State<AppDb>) -> DbResult<HashMap<String, String>> {
    with_conn(&state, |c, _| db::get_settings(c))
}

#[tauri::command]
pub fn set_setting(app: AppHandle, state: State<AppDb>, key: String, value: String) -> DbResult<()> {
    let previous = with_conn(&state, |c, _| db::get_settings(c))?;
    with_conn(&state, |c, _| db::set_setting(c, &key, &value))?; // valida antes de aplicar nada

    match key.as_str() {
        "hotkey" => {
            let old = previous.get("hotkey").cloned().unwrap_or_default();
            let _ = app.global_shortcut().unregister_all();
            if let Err(e) = window::register_hotkey(&app, &value) {
                // Otra app tiene ese atajo: se deja el anterior funcionando.
                let _ = with_conn(&state, |c, _| db::set_setting(c, "hotkey", &old));
                let _ = window::register_hotkey(&app, &old);
                return Err(format!("No se pudo usar «{value}»; puede que otra app ya lo tenga. ({e})"));
            }
            app.state::<WinState>().hotkey_ok.store(true, Ordering::SeqCst);
        }
        "always_on_top" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_always_on_top(value == "1");
            }
        }
        _ => {}
    }
    Ok(())
}

/// Esconde la ventana (queda en la bandeja).
#[tauri::command]
pub fn hide_window(app: AppHandle) {
    window::hide_main(&app);
}

/// `false` si el atajo global no se pudo registrar porque otra app lo usa.
#[tauri::command]
pub fn hotkey_status(win: State<WinState>) -> bool {
    win.hotkey_ok.load(Ordering::SeqCst)
}

/// Ajuste "Efectos de transparencia" de Windows: si está apagado, el acrílico se ve gris opaco.
#[tauri::command]
pub fn transparency_enabled() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        winreg::RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
            .and_then(|key| key.get_value::<u32, _>("EnableTransparency"))
            .map(|v| v != 0)
            .unwrap_or(true)
    }
    #[cfg(not(windows))]
    {
        true
    }
}
