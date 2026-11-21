mod commands;
mod db;
mod hotkey;
mod window;

use commands::AppDb;
use rusqlite::Connection;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::ShortcutState;
use window::WinState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Si ya hay una Words abierta (aunque esté en la bandeja), abrirla otra vez solo la muestra.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| window::show_main(app)))
        // El atajo global muestra u oculta la ventana desde cualquier programa.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::toggle_main(app);
                    }
                })
                .build(),
        )
        .manage(WinState::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("words.db"))?;
            db::init(&conn)?;
            let settings = db::get_settings(&conn)?;
            app.manage(AppDb(Mutex::new(conn)));

            let toggle = MenuItem::with_id(app, "toggle", "Mostrar / ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Words\nClic para mostrar u ocultar")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => window::toggle_main(app),
                    "quit" => {
                        window::save_geometry(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        window::toggle_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            let handle = app.handle().clone();
            window::setup_window(&handle);
            if let Some(win) = handle.get_webview_window("main") {
                let _ = win.set_always_on_top(settings.get("always_on_top").is_none_or(|v| v != "0"));
            }
            let hotkey = settings.get("hotkey").cloned().unwrap_or_default();
            match window::register_hotkey(&handle, &hotkey) {
                Ok(()) => handle.state::<WinState>().hotkey_ok.store(true, Ordering::SeqCst),
                Err(e) => eprintln!("No se pudo registrar el atajo {hotkey}: {e}"),
            }
            window::show_main(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_today,
            commands::record_answer,
            commands::complete_lot,
            commands::get_hard_words,
            commands::get_all_words,
            commands::set_hard,
            commands::get_stats,
            commands::get_lot_list,
            commands::select_lot,
            commands::start_random_lot,
            commands::get_lot_view,
            commands::get_settings,
            commands::set_setting,
            commands::hide_window,
            commands::hotkey_status,
            commands::transparency_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
