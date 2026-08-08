use tauri::{
    image::Image,
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    AppHandle, Manager, Position, LogicalPosition, WebviewWindowBuilder, WebviewUrl,
};
use crate::config::log_msg;
use crate::network::UsageSnapshot;

/// Menu bar icon, embedded so the "icon only" mode always has something to render
/// regardless of app bundling/signing state.
static TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");

/// Sets up the system tray and its click listeners.
pub fn create_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let _tray = TrayIconBuilder::with_id("main")
        .on_tray_icon_event(|tray, event| {
            // IMPORTANT: Only handle mouse-UP to prevent double-fire
            // (macOS sends Click for both Down and Up states)
            if let TrayIconEvent::Click { button, button_state, position, .. } = event {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    let app = tray.app_handle();
                    toggle_popup_window(app, position);
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Converts a "Xh Ym" / "Ym" reset string into the compact "X:MM" / "Ym" form.
fn format_compact_reset(reset: &str) -> String {
    if let Some((h, rest)) = reset.split_once('h') {
        let m: u32 = rest.trim().trim_end_matches('m').trim().parse().unwrap_or(0);
        format!("{}:{:02}", h.trim(), m)
    } else {
        reset.to_string()
    }
}

/// Dynamically updates the tray menu items text/icon to reflect the latest usage data,
/// according to the configured menu bar display mode ("full" | "compact" | "icon_only").
pub fn update_tray_menu_text(app: &AppHandle, snapshot: &UsageSnapshot, mode: &str) {
    if let Some(tray) = app.tray_by_id("main") {
        let reset_5h = snapshot.five_hour_reset_in.as_deref().unwrap_or("N/A");
        let session_label = if reset_5h == "N/A" || reset_5h.is_empty() {
            "Session"
        } else {
            reset_5h
        };

        match mode {
            "icon_only" => {
                let _ = tray.set_title(None::<&str>);
                if let Ok(icon) = Image::from_bytes(TRAY_ICON_BYTES) {
                    let _ = tray.set_icon(Some(icon));
                }
            }
            "compact" => {
                let _ = tray.set_icon(None);
                let compact_time = format_compact_reset(session_label);
                let title = format!(
                    "{}({}%)|W {}%",
                    compact_time,
                    snapshot.five_hour_utilization,
                    snapshot.seven_day_utilization
                );
                let _ = tray.set_title(Some(title));
            }
            _ => {
                // "full" (default) — single-line side-by-side formatting, text only
                let _ = tray.set_icon(None);
                let title = format!(
                    "{} ({}%) | Weekly ({}%)",
                    session_label,
                    snapshot.five_hour_utilization,
                    snapshot.seven_day_utilization
                );
                let _ = tray.set_title(Some(title));
            }
        }
    }
}

/// Toggles the floating popup window and positions it beneath the tray icon.
pub fn toggle_popup_window(app: &AppHandle, tray_pos: tauri::PhysicalPosition<f64>) {
    let popup = app.get_webview_window("popup").expect("Popup window not found");

    if popup.is_visible().unwrap_or(false) {
        let _ = popup.hide();
    } else {
        // Position window horizontally centered beneath the tray icon
        let monitor = popup.current_monitor().ok().flatten();
        let scale_factor = monitor.map(|m| m.scale_factor()).unwrap_or(1.0);

        let logical_x = tray_pos.x as f64 / scale_factor;
        let logical_y = tray_pos.y as f64 / scale_factor;

        let width = 640.0;
        let popup_x = logical_x - (width / 2.0);
        let popup_y = logical_y + 12.0;

        let _ = popup.set_position(Position::Logical(LogicalPosition::new(popup_x, popup_y)));
        let _ = popup.show();
        let _ = popup.set_focus();
        log_msg("debug", &format!("Opened popup window at logical position: {}, {}", popup_x, popup_y));
    }
}

/// Opens the main dashboard window (creates it if it does not exist, or focuses it if it does).
pub fn open_dashboard_window(app: &AppHandle) {
    if let Some(dashboard) = app.get_webview_window("main") {
        let _ = dashboard.show();
        let _ = dashboard.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
            .title("Claudee Tracky Dashboard")
            .inner_size(850.0, 600.0)
            .resizable(true)
            .min_inner_size(700.0, 500.0)
            .build()
            .unwrap();
    }
}
