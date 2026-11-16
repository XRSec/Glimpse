mod ocr;
mod simulator;
mod keyboard;
mod cua_driver;

use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

static LATEST_MASK_SYNC: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static LATEST_SCRIPT_SYNC: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static GLOBAL_APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);
static EXECUTION_ABORT: AtomicBool = AtomicBool::new(false);

extern "C" fn on_global_esc_pressed() {
    EXECUTION_ABORT.store(true, Ordering::SeqCst);
    ocr::set_mask_selecting_state(false);
    if let Ok(guard) = GLOBAL_APP_HANDLE.lock() {
        if let Some(app) = guard.as_ref() {
            let _ = app.emit("glimpse_emergency_stop", ());
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.eval("if (window.__glimpse_emergency_stop) { window.__glimpse_emergency_stop(); }");
            }
            if let Some(mask_win) = app.get_webview_window("mask-overlay") {
                let _ = mask_win.eval("if (window.__glimpse_emergency_stop) { window.__glimpse_emergency_stop(); }");
            }
        }
    }
}

pub fn append_log(level: &str, message: &str) {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let line = format!("[{}] [{}] {}\n", now, level.to_uppercase(), message);
    let log_dir = std::path::Path::new(".glimpse_logs");
    if !log_dir.exists() { let _ = create_dir_all(log_dir); }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_dir.join("glimpse.log")) {
        let _ = file.write_all(line.as_bytes());
    }
}

#[tauri::command]
fn write_app_log(level: String, message: String) -> Result<(), String> {
    append_log(&level, &message);
    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ClickResult {
    pub success: bool,
    pub message: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[tauri::command]
fn broadcast_mask_sync(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if let Ok(mut state) = LATEST_MASK_SYNC.lock() { *state = Some(payload.clone()); }
    let _ = app.emit("glimpse_mask_sync_event", &payload);
    if let Ok(json_str) = serde_json::to_string(&payload) {
        let s = format!("if (window.__glimpse_on_mask_sync) {{ window.__glimpse_on_mask_sync({}); }}", json_str);
        if let Some(w) = app.get_webview_window("mask-overlay") { let _ = w.eval(&s); }
        if let Some(w) = app.get_webview_window("main") { let _ = w.eval(&s); }
    }
    Ok(())
}

#[tauri::command]
fn get_latest_mask_sync() -> Result<Option<serde_json::Value>, String> {
    if let Ok(state) = LATEST_MASK_SYNC.lock() { Ok(state.clone()) } else { Ok(None) }
}

#[tauri::command]
fn broadcast_script_sync(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if let Ok(mut state) = LATEST_SCRIPT_SYNC.lock() { *state = Some(payload.clone()); }
    let _ = app.emit("glimpse_script_sync_event", &payload);
    if let Ok(json_str) = serde_json::to_string(&payload) {
        let s = format!("if (window.__glimpse_on_script_sync) {{ window.__glimpse_on_script_sync({}); }}", json_str);
        if let Some(w) = app.get_webview_window("main") { let _ = w.eval(&s); }
        if let Some(w) = app.get_webview_window("mask-overlay") { let _ = w.eval(&s); }
    }
    Ok(())
}

#[tauri::command]
fn emergency_stop(app: tauri::AppHandle) -> Result<(), String> {
    EXECUTION_ABORT.store(true, Ordering::SeqCst);
    ocr::set_mask_selecting_state(false);
    let _ = app.emit("glimpse_emergency_stop", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval("if (window.__glimpse_emergency_stop) { window.__glimpse_emergency_stop(); }");
    }
    if let Some(w) = app.get_webview_window("mask-overlay") {
        let _ = w.eval("if (window.__glimpse_emergency_stop) { window.__glimpse_emergency_stop(); }");
    }
    Ok(())
}

#[tauri::command]
fn request_execution_abort() -> Result<(), String> {
    EXECUTION_ABORT.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn reset_execution_abort() -> Result<(), String> {
    EXECUTION_ABORT.store(false, Ordering::SeqCst);
    Ok(())
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
            // 严禁在此调用 window.set_focus()，蒙版悬浮层绝对不能夺取目标应用的键盘/鼠标焦点，否则会导致右键菜单等浮层立即被系统销毁


            if let Ok(state) = LATEST_MASK_SYNC.lock() {
                if let Some(ref val) = *state {
                    if let Ok(json_str) = serde_json::to_string(val) {
                        let script = format!("if (window.__glimpse_on_mask_sync) {{ window.__glimpse_on_mask_sync({}); }}", json_str);
                        let _ = window.eval(&script);
                    }
                }
            }
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
#[allow(non_snake_case)]
fn resize_mask_window(
    app: tauri::AppHandle,
    delta_w: Option<f64>,
    delta_h: Option<f64>,
    deltaW: Option<f64>,
    deltaH: Option<f64>,
) -> Result<(), String> {
    let dw = delta_w.or(deltaW).unwrap_or(0.0);
    let dh = delta_h.or(deltaH).unwrap_or(0.0);
    if let Some(window) = app.get_webview_window("mask-overlay") {
        if let Ok(size) = window.outer_size() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let new_w = ((size.width as f64) + dw * scale).max(120.0 * scale) as u32;
            let new_h = ((size.height as f64) + dh * scale).max(100.0 * scale) as u32;
            let _ = window.set_size(tauri::PhysicalSize::new(new_w, new_h));
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
fn get_mask_screen_bounds(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if let Some(window) = app.get_webview_window("mask-overlay") {
        #[cfg(target_os = "macos")]
        {
            use cocoa::appkit::{NSScreen, NSWindow};
            use cocoa::base::{id, nil};
            if let Ok(ns_win) = window.ns_window() {
                let ns_window = ns_win as id;
                unsafe {
                    let frame = NSWindow::frame(ns_window);
                    let screens = NSScreen::screens(nil);
                    let primary_screen: id = cocoa::foundation::NSArray::objectAtIndex(screens, 0);
                    let primary_frame = NSScreen::frame(primary_screen);
                    let primary_h = primary_frame.size.height;

                    let cg_x = frame.origin.x;
                    let cg_y = primary_h - (frame.origin.y + frame.size.height);
                    let cg_w = frame.size.width;
                    let cg_h = frame.size.height;
                    let is_vis = NSWindow::isVisible(ns_window);

                    return Ok(serde_json::json!({
                        "x": cg_x,
                        "y": cg_y,
                        "width": cg_w,
                        "height": cg_h,
                        "visible": is_vis
                    }));
                }
            }
        }
    }
    Ok(serde_json::json!({
        "x": 0.0,
        "y": 0.0,
        "width": 760.0,
        "height": 520.0,
        "visible": false
    }))
}

#[tauri::command]
async fn click_position(x: f64, y: f64, button: Option<String>) -> Result<ClickResult, String> {
    let btn = button.unwrap_or_else(|| "left".to_string());
    tokio::task::spawn_blocking(move || simulator::click_at(x, y, &btn))
        .await
        .map_err(|e| e.to_string())??;
    Ok(ClickResult {
        success: true,
        message: format!("已成功点击坐标 ({:.0}, {:.0})", x, y),
        x: Some(x), y: Some(y), width: None, height: None,
    })
}

#[tauri::command]
async fn drag_line(x1: f64, y1: f64, x2: f64, y2: f64, duration: Option<f64>) -> Result<ClickResult, String> {
    let d = duration.unwrap_or(0.5);
    tokio::task::spawn_blocking(move || simulator::drag_line(x1, y1, x2, y2, d))
        .await
        .map_err(|e| e.to_string())??;
    Ok(ClickResult {
        success: true,
        message: format!("已从 ({:.0}, {:.0}) 直线拖动到 ({:.0}, {:.0})", x1, y1, x2, y2),
        x: Some(x2), y: Some(y2), width: None, height: None,
    })
}

#[tauri::command]
async fn drag_curve(x1: f64, y1: f64, cx: f64, cy: f64, x2: f64, y2: f64, duration: Option<f64>) -> Result<ClickResult, String> {
    let d = duration.unwrap_or(0.8);
    tokio::task::spawn_blocking(move || simulator::drag_curve(x1, y1, cx, cy, x2, y2, d))
        .await
        .map_err(|e| e.to_string())??;
    Ok(ClickResult {
        success: true,
        message: format!("已沿曲线从 ({:.0}, {:.0}) 拖动到 ({:.0}, {:.0})", x1, y1, x2, y2),
        x: Some(x2), y: Some(y2), width: None, height: None,
    })
}

#[tauri::command]
async fn scroll_wheel(direction: String, distance: i32, x: Option<f64>, y: Option<f64>) -> Result<ClickResult, String> {
    let dir = direction.clone();
    tokio::task::spawn_blocking(move || simulator::scroll(&dir, distance, x, y))
        .await
        .map_err(|e| e.to_string())??;
    Ok(ClickResult {
        success: true,
        message: format!("已向{}滚动 {} 步", if direction == "down" { "下" } else { "上" }, distance),
        x, y, width: None, height: None,
    })
}

#[tauri::command]
async fn send_key(key: String, repeat: Option<u32>) -> Result<ClickResult, String> {
    let k = key.clone();
    let count = repeat.unwrap_or(1);
    tokio::task::spawn_blocking(move || keyboard::send_key(&k, count))
        .await
        .map_err(|e| e.to_string())??;
    Ok(ClickResult {
        success: true,
        message: format!("已发送按键「{}」", key),
        x: None, y: None, width: None, height: None,
    })
}

fn set_mask_rectangles_visible_internal(app: &tauri::AppHandle, visible: bool) {
    if let Some(w) = app.get_webview_window("mask-overlay") {
        let script = format!("if (window.__glimpse_set_rects_visible) {{ window.__glimpse_set_rects_visible({}); }}", visible);
        let _ = w.eval(&script);
    }
    if !visible {
        sleep(Duration::from_millis(25));
    }
}

#[tauri::command]
fn set_mask_rectangles_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    set_mask_rectangles_visible_internal(&app, visible);
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
fn click_text_ocr(
    app: tauri::AppHandle,
    target_text: String, is_fuzzy: Option<bool>, offset_x: Option<f64>, offset_y: Option<f64>,
    timeout_seconds: Option<f64>, button: Option<String>,
    roi_x: Option<f64>, roi_y: Option<f64>, roi_w: Option<f64>, roi_h: Option<f64>,
    roiX: Option<f64>, roiY: Option<f64>, roiW: Option<f64>, roiH: Option<f64>,
) -> Result<ClickResult, String> {
    let fuzzy = is_fuzzy.unwrap_or(true);
    let ox = offset_x.unwrap_or(0.0);
    let oy = offset_y.unwrap_or(0.0);
    let timeout = timeout_seconds.unwrap_or(5.0);
    let btn = button.unwrap_or_else(|| "left".to_string());

    let rx = roi_x.or(roiX);
    let ry = roi_y.or(roiY);
    let rw = roi_w.or(roiW);
    let rh = roi_h.or(roiH);
    let roi = match (rx, ry, rw, rh) {
        (Some(x), Some(y), Some(w), Some(h)) if w > 0.0 && h > 0.0 => Some((x, y, w, h)),
        _ => None,
    };

    let start = Instant::now();
    let duration = Duration::from_secs_f64(timeout);

    while start.elapsed() <= duration {
        if EXECUTION_ABORT.load(Ordering::SeqCst) {
            return Ok(ClickResult {
                success: false,
                message: format!("执行已中止"),
                x: None, y: None, width: None, height: None,
            });
        }
        
        set_mask_rectangles_visible_internal(&app, false);
        std::thread::sleep(Duration::from_millis(20));
        let loc_opt = ocr::find_text_on_screen(&target_text, fuzzy, roi);
        set_mask_rectangles_visible_internal(&app, true);

        if let Some(loc) = loc_opt {
            let final_x = loc.x + ox;
            let final_y = loc.y + oy;
            sleep(Duration::from_millis(150));
            simulator::click_at(final_x, final_y, &btn)?;
            return Ok(ClickResult {
                success: true,
                message: format!("OCR 找到「{}」并已点击 ({:.0}, {:.0})", target_text, final_x, final_y),
                x: Some(final_x), y: Some(final_y), width: Some(loc.width), height: Some(loc.height),
            });
        }
        if EXECUTION_ABORT.load(Ordering::SeqCst) {
            return Ok(ClickResult {
                success: false,
                message: format!("执行已中止"),
                x: None, y: None, width: None, height: None,
            });
        }
        sleep(Duration::from_millis(100));
    }

    Ok(ClickResult {
        success: false,
        message: format!("超时 {:.1}s 未能在限定区域内找到「{}」", timeout, target_text),
        x: None, y: None, width: None, height: None,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
fn find_text_position(
    app: tauri::AppHandle,
    target_text: String, is_fuzzy: Option<bool>,
    roi_x: Option<f64>, roi_y: Option<f64>, roi_w: Option<f64>, roi_h: Option<f64>,
    roiX: Option<f64>, roiY: Option<f64>, roiW: Option<f64>, roiH: Option<f64>,
    timeout_seconds: Option<f64>,
    #[allow(non_snake_case)] ocrImageScale: Option<f64>,
    ocr_image_scale: Option<f64>,
) -> Result<ClickResult, String> {
    let fuzzy = is_fuzzy.unwrap_or(true);
    let timeout = timeout_seconds.unwrap_or(2.5);
    let _scale = ocrImageScale.or(ocr_image_scale).unwrap_or(1.0);
    let rx = roi_x.or(roiX);
    let ry = roi_y.or(roiY);
    let rw = roi_w.or(roiW);
    let rh = roi_h.or(roiH);
    let roi = match (rx, ry, rw, rh) {
        (Some(x), Some(y), Some(w), Some(h)) if w > 0.0 && h > 0.0 => Some((x, y, w, h)),
        _ => None,
    };

    let start = Instant::now();
    let duration = Duration::from_secs_f64(timeout);

    while start.elapsed() <= duration {
        if EXECUTION_ABORT.load(Ordering::SeqCst) {
            return Ok(ClickResult {
                success: false,
                message: format!("执行已中止"),
                x: None, y: None, width: None, height: None,
            });
        }
        
        set_mask_rectangles_visible_internal(&app, false);
        std::thread::sleep(Duration::from_millis(20));
        let loc_opt = ocr::find_text_on_screen(&target_text, fuzzy, roi);
        set_mask_rectangles_visible_internal(&app, true);

        if let Some(loc) = loc_opt {
            return Ok(ClickResult {
                success: true,
                message: format!("已在限定区域内检测到文字「{}」在屏幕坐标 ({:.0}, {:.0})", target_text, loc.x, loc.y),
                x: Some(loc.x),
                y: Some(loc.y),
                width: Some(loc.width),
                height: Some(loc.height),
            });
        }
        if EXECUTION_ABORT.load(Ordering::SeqCst) {
            return Ok(ClickResult {
                success: false,
                message: format!("执行已中止"),
                x: None, y: None, width: None, height: None,
            });
        }
        sleep(Duration::from_millis(100));
    }

    Ok(ClickResult {
        success: false,
        message: format!("在限定区域内未检测到目标文字「{}」", target_text),
        x: None,
        y: None,
        width: None,
        height: None,
    })
}

#[tauri::command]
fn check_accessibility() -> bool { ocr::is_accessibility_trusted() }
#[tauri::command]
fn open_accessibility_panel() { ocr::open_accessibility_settings(); }
#[tauri::command]
fn check_screen_recording() -> bool { ocr::is_screen_recording_trusted() }
#[tauri::command]
fn open_screen_recording_panel() { ocr::open_screen_recording_settings(); }

static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

extern "C" fn on_mouse_click_recorded(x: f64, y: f64, btn_ptr: *const std::os::raw::c_char) {
    if let Some(app) = APP_HANDLE.get() {
        let btn = if btn_ptr.is_null() {
            "left".to_string()
        } else {
            unsafe { std::ffi::CStr::from_ptr(btn_ptr).to_string_lossy().into_owned() }
        };
        let _ = app.emit("recorded-click", serde_json::json!({ "x": x, "y": y, "button": btn }));
    }
}

#[tauri::command]
fn start_recording_clicks(app: tauri::AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.set(app);
    ocr::start_mouse_recording(on_mouse_click_recorded);
    Ok(())
}

#[tauri::command]
fn stop_recording_clicks() -> Result<(), String> {
    ocr::stop_mouse_recording();
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_running_apps() -> Result<serde_json::Value, String> {
    serde_json::from_str(&ocr::get_running_apps_json()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_frontmost_app() -> Result<serde_json::Value, String> {
    serde_json::from_str(&ocr::get_frontmost_app_json()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_at_point(x: f64, y: f64) -> Result<serde_json::Value, String> {
    serde_json::from_str(&ocr::get_app_at_point_json(x, y)).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_app_window_bounds(
    pid: Option<i32>, bundle_id: Option<String>, app_name: Option<String>,
    x: Option<f64>, y: Option<f64>, width: Option<f64>, height: Option<f64>,
) -> Result<ocr::AppWindowBoundsResult, String> {
    Ok(ocr::set_app_window_bounds(pid.unwrap_or(0), bundle_id.as_deref(), app_name.as_deref(), x, y, width, height))
}

#[tauri::command]
fn activate_target_app(pid: Option<i32>, bundle_id: Option<String>, app_name: Option<String>) -> Result<bool, String> {
    Ok(ocr::activate_app(pid, bundle_id.as_deref(), app_name.as_deref()))
}

#[tauri::command]
fn snap_mask_to_bounds(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mask-overlay") {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
fn capture_screen_roi(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    file_path: Option<String>,
    filePath: Option<String>,
) -> Result<bool, String> {
    let path = file_path.or(filePath).unwrap_or_else(|| "/tmp/glimpse_captured.png".to_string());
    set_mask_rectangles_visible_internal(&app, false);
    let res = ocr::capture_screen_rect_to_file(x, y, width, height, &path);
    set_mask_rectangles_visible_internal(&app, true);
    Ok(res)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
fn save_and_open_markdown_report(
    file_path: Option<String>,
    filePath: Option<String>,
    content: String,
) -> Result<bool, String> {
    let path_str = file_path.or(filePath).unwrap_or_else(|| {
        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        format!("/tmp/glimpse_audit/report_{}.md", ts)
    });
    let p = std::path::Path::new(&path_str);
    if let Some(parent) = p.parent() {
        let _ = create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).write(true).truncate(true).open(p) {
        let _ = f.write_all(content.as_bytes());
    } else {
        return Err("无法写入诊断报告文件".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path_str).spawn();
    }
    Ok(true)
}

// ---- cua-driver Tauri commands ----

#[tauri::command]
async fn cua_start() -> Result<(), String> {
    tokio::task::spawn_blocking(|| cua_driver::start())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_stop() {
    let _ = tokio::task::spawn_blocking(|| cua_driver::stop()).await;
}

#[tauri::command]
fn cua_is_ready() -> bool {
    cua_driver::is_ready()
}

#[tauri::command]
async fn cua_click(pid: i64, x: i64, y: i64, button: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::click(pid, x, y, &button))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_drag(pid: i64, from_x: i64, from_y: i64, to_x: i64, to_y: i64) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::drag(pid, from_x, from_y, to_x, to_y))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_scroll(pid: i64, x: i64, y: i64, direction: String, amount: i64) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::scroll(pid, x, y, &direction, amount))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_type_text(pid: i64, text: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::type_text(pid, &text))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_press_key(pid: i64, key: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::press_key(pid, &key))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cua_hotkey(pid: i64, keys: Vec<String>) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || cua_driver::hotkey(pid, keys))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(mut guard) = GLOBAL_APP_HANDLE.lock() {
                *guard = Some(app.handle().clone());
            }
            #[cfg(target_os = "macos")]
            {
                ocr::init_global_esc_monitor(on_global_esc_pressed);
                if let Some(window) = app.get_webview_window("mask-overlay") {
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
            find_text_position,
            drag_line,
            drag_curve,
            scroll_wheel,
            send_key,
            check_accessibility,
            open_accessibility_panel,
            check_screen_recording,
            open_screen_recording_panel,
            show_mask_overlay,
            set_mask_ignore_mouse,
            set_mask_rectangles_visible,
            start_drag_mask_window,
            set_mask_selecting_mode,
            move_mask_window,
            resize_mask_window,
            get_mask_screen_bounds,
            start_recording_clicks,
            stop_recording_clicks,
            open_external_url,
            get_running_apps,
            get_frontmost_app,
            get_app_at_point,
            set_app_window_bounds,
            activate_target_app,
            snap_mask_to_bounds,
            write_app_log,
            broadcast_mask_sync,
            get_latest_mask_sync,
            broadcast_script_sync,
            emergency_stop,
            request_execution_abort,
            reset_execution_abort,
            capture_screen_roi,
            save_and_open_markdown_report,
            read_text_file,
            cua_start,
            cua_stop,
            cua_is_ready,
            cua_click,
            cua_drag,
            cua_scroll,
            cua_type_text,
            cua_press_key,
            cua_hotkey
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glimpse application");
}
