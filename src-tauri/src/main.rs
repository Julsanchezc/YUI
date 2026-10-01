// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};

#[tauri::command]
fn resize_notch(window: tauri::Window, expanded: bool) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen_size = monitor.size();
        let scale_factor = monitor.scale_factor();

        let (target_w, target_h) = if expanded {
            (680.0, 560.0)
        } else {
            (380.0, 64.0)
        };

        let phys_w = (target_w * scale_factor) as u32;
        let phys_h = (target_h * scale_factor) as u32;

        let center_x = if screen_size.width > phys_w {
            (screen_size.width - phys_w) / 2
        } else {
            0
        };

        let _ = window.set_size(PhysicalSize::new(phys_w, phys_h));
        let _ = window.set_position(PhysicalPosition::new(center_x as i32, 0));
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Ensure initial position is centered at the top edge of screen
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let initial_w = (380.0 * scale_factor) as u32;
                    let initial_h = (64.0 * scale_factor) as u32;
                    let center_x = if screen_size.width > initial_w {
                        (screen_size.width - initial_w) / 2
                    } else {
                        0
                    };
                    let _ = window.set_size(PhysicalSize::new(initial_w, initial_h));
                    let _ = window.set_position(PhysicalPosition::new(center_x as i32, 0));
                }
                let _ = window.set_always_on_top(true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![resize_notch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
