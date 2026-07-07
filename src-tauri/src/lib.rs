mod keychain;
mod network;
mod config;
mod polling;
mod notifications;
mod commands;
mod tray;

use tokio::sync::mpsc;
use tauri::{Manager, RunEvent, Listener};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    config::log_msg("info", "Initializing Claudee Tracky...");

    // Channel for manual refresh triggering
    let (refresh_tx, refresh_rx) = mpsc::channel::<()>(10);
    
    // Create shared PollingManager state
    let polling_manager = polling::PollingManager::new(refresh_tx, None);

    tauri::Builder::default()
        // Register plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--asstart"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        // Manage shared state
        .manage(polling_manager)
        // Set invoke handlers
        .invoke_handler(tauri::generate_handler![
            commands::get_app_settings,
            commands::save_app_settings,
            commands::get_usage_history,
            commands::clear_usage_history,
            commands::get_app_logs,
            commands::force_refresh_usage,
            commands::get_current_snapshot_state,
            commands::export_history_to_csv,
            commands::open_dashboard_window,
            commands::hide_popup,
            commands::get_claude_cli_analytics,
        ])
        .setup(move |app| {
            let app_handle = app.app_handle().clone();

            // Create system tray
            let _ = tray::create_tray(&app_handle);

            // Load persisted settings
            let settings = config::load_settings(&app_handle);

            // Retrieve popup window from configuration
            let popup_window = app_handle.get_webview_window("popup")
                .expect("Popup window must be defined in tauri.conf.json");

            // Programmatically set window background to transparent and disable shadow (clears macOS white background leak)
            let _ = popup_window.set_background_color(None);
            let _ = popup_window.set_shadow(false);

            // NOTE: Auto-hide is handled from the frontend via debounced window.blur listener
            // The Rust-side Focused(false) event fires too eagerly on macOS tray clicks

            // If launch minimized is false, open the main dashboard immediately
            if !settings.minimize_to_tray {
                let _ = tauri::WebviewWindowBuilder::new(
                    &app_handle,
                    "main",
                    tauri::WebviewUrl::App("index.html".into())
                )
                .title("Claudee Tracky Dashboard")
                .inner_size(850.0, 600.0)
                .resizable(true)
                .min_inner_size(700.0, 500.0)
                .build();
            }

            // Sync dynamic tray menu text updates on usage updates
            let app_handle_for_events = app_handle.clone();
            app_handle.listen("usage-updated", move |event| {
                if let Ok(snapshot) = serde_json::from_str::<network::UsageSnapshot>(event.payload()) {
                    tray::update_tray_menu_text(&app_handle_for_events, &snapshot);
                }
            });

            // Spawn background polling task
            let manager = app_handle.state::<polling::PollingManager>();
            let polling_state = manager.state.clone();
            
            tauri::async_runtime::spawn(async move {
                polling::start_polling_loop(app_handle, polling_state, refresh_rx).await;
            });

            config::log_msg("info", "Tauri initialization completed.");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Keep the application running in the system tray when windows are closed
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
