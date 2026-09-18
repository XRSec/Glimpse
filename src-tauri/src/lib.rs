mod ocr;
mod simulator;

use serde::{Deserialize, Serialize};
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug)]
pub struct ClickResult {
    pub success: bool,
    pub message: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

#[tauri::command]
fn show_mask_overlay(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mask-overlay") {
        if show {
            #[cfg(target_os = "macos")]
            {
                if let Ok(ns_win) = window.ns_window() {
                    ocr::apply_mask_window_passthrough(ns_win as *mut std::ffi::c_void);
                }
            }

            window.show().map_err(|e| e.to_string())?;
            window.set_focus().ok();
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn set_mask_ignore_mouse(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mask-overlay") {
        window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn start_drag_mask_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mask-overlay") {
        if let Ok(ns_win) = window.ns_window() {
            ocr::drag_mask_window(ns_win as *mut std::ffi::c_void);
        }
    }
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
fn move_mask_window(app: tauri::AppHandle, delta_x: Option<f64>, delta_y: Option<f64>, deltaX: Option<f64>, deltaY: Option<f64>) -> Result<(), String> {
    let dx = delta_x.or(deltaX).unwrap_or(0.0);
    let dy = delta_y.or(deltaY).unwrap_or(0.0);
    if let Some(window) = app.get_webview_window("mask-overlay") {
        if let Ok(pos) = window.outer_position() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let _ = window.set_position(tauri::PhysicalPosition::new(
                pos.x + (dx * scale).round() as i32,
                pos.y + (dy * scale).round() as i32,
            ));
        }
    }
    Ok(())
}

#[tauri::command]
fn set_mask_selecting_mode(selecting: bool) -> Result<(), String> {
    ocr::set_mask_selecting_state(selecting);
    Ok(())
}

#[tauri::command]
fn click_position(x: f64, y: f64, button: Option<String>) -> Result<ClickResult, String> {
    let btn = button.unwrap_or_else(|| "left".to_string());
    simulator::click_at(x, y, &btn)?;
    Ok(ClickResult {
        success: true,
        message: format!("已成功点击坐标 ({:.0}, {:.0})", x, y),
        x: Some(x),
        y: Some(y),
    })
}

#[tauri::command]
fn drag_line(x1: f64, y1: f64, x2: f64, y2: f64, duration: Option<f64>) -> Result<ClickResult, String> {
    let d = duration.unwrap_or(0.5);
    simulator::drag_line(x1, y1, x2, y2, d)?;
    Ok(ClickResult {
        success: true,
        message: format!("已从 ({:.0}, {:.0}) 直线拖动到 ({:.0}, {:.0})", x1, y1, x2, y2),
        x: Some(x2),
        y: Some(y2),
    })
}

#[tauri::command]
fn drag_curve(x1: f64, y1: f64, cx: f64, cy: f64, x2: f64, y2: f64, duration: Option<f64>) -> Result<ClickResult, String> {
    let d = duration.unwrap_or(0.8);
    simulator::drag_curve(x1, y1, cx, cy, x2, y2, d)?;
    Ok(ClickResult {
        success: true,
        message: format!("已沿曲线从 ({:.0}, {:.0}) 拖动到 ({:.0}, {:.0})", x1, y1, x2, y2),
        x: Some(x2),
        y: Some(y2),
    })
}

#[tauri::command]
fn scroll_wheel(direction: String, distance: i32, x: Option<f64>, y: Option<f64>) -> Result<ClickResult, String> {
    simulator::scroll(&direction, distance, x, y)?;
    Ok(ClickResult {
        success: true,
        message: format!("已向{}滚动 {} 步", if direction == "down" { "下" } else { "上" }, distance),
        x,
        y,
    })
}

#[tauri::command]
fn click_text_ocr(
    target_text: String,
    is_fuzzy: Option<bool>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
    timeout_seconds: Option<f64>,
    button: Option<String>,
    roi_x: Option<f64>,
    roi_y: Option<f64>,
    roi_w: Option<f64>,
    roi_h: Option<f64>,
) -> Result<ClickResult, String> {
    let fuzzy = is_fuzzy.unwrap_or(true);
    let ox = offset_x.unwrap_or(0.0);
    let oy = offset_y.unwrap_or(0.0);
    let timeout = timeout_seconds.unwrap_or(5.0);
    let btn = button.unwrap_or_else(|| "left".to_string());

    let roi = match (roi_x, roi_y, roi_w, roi_h) {
        (Some(x), Some(y), Some(w), Some(h)) if w > 0.0 && h > 0.0 => Some((x, y, w, h)),
        _ => None,
    };

    let start = Instant::now();
    let duration = Duration::from_secs_f64(timeout);

    while start.elapsed() <= duration {
        if let Some(loc) = ocr::find_text_on_screen(&target_text, fuzzy, roi) {
            let final_x = loc.x + ox;
            let final_y = loc.y + oy;
            simulator::click_at(final_x, final_y, &btn)?;
            return Ok(ClickResult {
                success: true,
                message: format!("OCR 找到「{}」并已点击 ({:.0}, {:.0})", target_text, final_x, final_y),
                x: Some(final_x),
                y: Some(final_y),
            });
        }
        sleep(Duration::from_millis(300));
    }

    Ok(ClickResult {
        success: false,
        message: format!("超时 {:.1}s 未能在限定区域内找到「{}」", timeout, target_text),
        x: None,
        y: None,
    })
}

#[tauri::command]
fn check_accessibility() -> bool {
    ocr::is_accessibility_trusted()
}

#[tauri::command]
fn open_accessibility_panel() {
    ocr::open_accessibility_settings();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("mask-overlay") {
                #[cfg(target_os = "macos")]
                {
                    if let Ok(ns_win) = window.ns_window() {
                        ocr::apply_mask_window_passthrough(ns_win as *mut std::ffi::c_void);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            click_position,
            click_text_ocr,
            drag_line,
            drag_curve,
            scroll_wheel,
            check_accessibility,
            open_accessibility_panel,
            show_mask_overlay,
            set_mask_ignore_mouse,
            start_drag_mask_window,
            set_mask_selecting_mode,
            move_mask_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glimpse application");
}
