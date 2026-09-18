use std::ffi::CString;
use std::os::raw::{c_char, c_int};

#[repr(C)]
struct NativeOCRResult {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    found: c_int,
}

extern "C" {
    fn recognize_and_find_text(
        target: *const c_char,
        is_fuzzy: c_int,
        roi_x: f64,
        roi_y: f64,
        roi_w: f64,
        roi_h: f64,
    ) -> NativeOCRResult;

    fn native_check_accessibility() -> c_int;
    fn native_open_accessibility_pref();
    fn native_check_screen_recording() -> c_int;
    fn native_request_screen_recording();
    fn start_dynamic_mask_passthrough(window_ptr: *mut std::ffi::c_void);
    fn native_perform_window_drag(window_ptr: *mut std::ffi::c_void);
    fn set_mask_selecting_mode(is_selecting: c_int);
    fn native_ensure_mask_passthrough();
    fn native_activate_app_at_point(x: f64, y: f64);
    fn native_start_mouse_recording(callback: extern "C" fn(f64, f64, *const c_char));
    fn native_stop_mouse_recording();
    fn native_init_global_esc_monitor(callback: extern "C" fn());
    fn native_free_string(ptr: *mut c_char);
    fn native_get_running_apps_json() -> *mut c_char;
    fn native_get_frontmost_app_json() -> *mut c_char;
    fn native_get_app_at_point_json(x: f64, y: f64) -> *mut c_char;
    fn native_set_app_window_bounds(
        pid: c_int,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        move_pos: c_int,
        resize_size: c_int,
    ) -> c_int;
    fn native_set_app_window_bounds_json(
        pid: c_int,
        bundle_id: *const c_char,
        app_name: *const c_char,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        move_pos: c_int,
        resize_size: c_int,
    ) -> *mut c_char;
    fn native_activate_app_by_pid_or_bundle(
        pid: c_int,
        bundle_id: *const c_char,
        app_name: *const c_char,
    ) -> c_int;
    fn native_save_screenshot_rect(
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        file_path: *const c_char,
    ) -> c_int;
}

pub struct FoundTextLocation {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn find_text_on_screen(
    target: &str,
    is_fuzzy: bool,
    roi: Option<(f64, f64, f64, f64)>,
) -> Option<FoundTextLocation> {
    let c_target = CString::new(target).ok()?;
    let (rx, ry, rw, rh) = roi.unwrap_or((0.0, 0.0, 0.0, 0.0));

    unsafe {
        let res = recognize_and_find_text(
            c_target.as_ptr(),
            if is_fuzzy { 1 } else { 0 },
            rx,
            ry,
            rw,
            rh,
        );

        if res.found == 1 {
            Some(FoundTextLocation {
                x: res.x,
                y: res.y,
                width: res.width,
                height: res.height,
            })
        } else {
            None
        }
    }
}

pub fn is_accessibility_trusted() -> bool {
    unsafe { native_check_accessibility() == 1 }
}

pub fn open_accessibility_settings() {
    unsafe { native_open_accessibility_pref() }
}

pub fn is_screen_recording_trusted() -> bool {
    unsafe { native_check_screen_recording() == 1 }
}

pub fn open_screen_recording_settings() {
    unsafe { native_request_screen_recording() }
}

pub fn apply_mask_window_passthrough(window_ptr: *mut std::ffi::c_void) {
    unsafe { start_dynamic_mask_passthrough(window_ptr) }
}

pub fn drag_mask_window(window_ptr: *mut std::ffi::c_void) {
    unsafe { native_perform_window_drag(window_ptr) }
}

pub fn set_mask_selecting_state(selecting: bool) {
    unsafe { set_mask_selecting_mode(if selecting { 1 } else { 0 }) }
}

pub fn ensure_mask_passthrough() {
    unsafe { native_ensure_mask_passthrough() }
}

pub fn activate_window_at(x: f64, y: f64) {
    unsafe { native_activate_app_at_point(x, y) }
}

pub fn start_mouse_recording(callback: extern "C" fn(f64, f64, *const std::os::raw::c_char)) {
    unsafe { native_start_mouse_recording(callback) }
}

pub fn stop_mouse_recording() {
    unsafe { native_stop_mouse_recording() }
}

pub fn init_global_esc_monitor(callback: extern "C" fn()) {
    unsafe { native_init_global_esc_monitor(callback) }
}

pub fn get_running_apps_json() -> String {
    unsafe {
        let ptr = native_get_running_apps_json();
        if ptr.is_null() {
            return "[]".to_string();
        }
        let c_str = std::ffi::CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        native_free_string(ptr);
        s
    }
}

pub fn get_frontmost_app_json() -> String {
    unsafe {
        let ptr = native_get_frontmost_app_json();
        if ptr.is_null() {
            return "{}".to_string();
        }
        let c_str = std::ffi::CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        native_free_string(ptr);
        s
    }
}

pub fn get_app_at_point_json(x: f64, y: f64) -> String {
    unsafe {
        let ptr = native_get_app_at_point_json(x, y);
        if ptr.is_null() {
            return "{}".to_string();
        }
        let c_str = std::ffi::CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        native_free_string(ptr);
        s
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AppWindowBoundsResult {
    pub success: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, alias = "appName", rename = "appName")]
    pub app_name: Option<String>,
    #[serde(default)]
    pub pid: Option<i32>,
}

use axuielement::{AXPoint, AXSize, AXUIElement};

pub fn set_app_window_bounds(
    pid: i32,
    bundle_id: Option<&str>,
    app_name: Option<&str>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> AppWindowBoundsResult {
    // 1. 若拥有有效 PID，优先通过 safe Rust axuielement 库进行毫秒级精准设置
    if pid > 0 {
        if let Some(app) = AXUIElement::from_pid(pid) {
            let mut target_win = app.element_attribute("AXMainWindow").ok().flatten();
            if target_win.is_none() {
                target_win = app.element_attribute("AXFocusedWindow").ok().flatten();
            }
            if target_win.is_none() {
                if let Ok(windows) = app.element_array_attribute("AXWindows") {
                    target_win = windows.into_iter().next();
                }
            }
            if let Some(win) = target_win {
                let _ = win.perform_action("AXRaise");
                if let (Some(w), Some(h)) = (width, height) {
                    if w > 10.0 && h > 10.0 {
                        let _ = win.set_size_attribute("AXSize", AXSize { width: w, height: h });
                    }
                }
                if let (Some(px), Some(py)) = (x, y) {
                    if px >= 0.0 && py >= 0.0 {
                        let _ = win.set_point_attribute("AXPosition", AXPoint { x: px, y: py });
                    }
                }
                if let (Some(w), Some(h)) = (width, height) {
                    if w > 10.0 && h > 10.0 {
                        let _ = win.set_size_attribute("AXSize", AXSize { width: w, height: h });
                    }
                }
            }
        }
    }

    let move_pos = if x.is_some() && y.is_some() { 1 } else { 0 };
    let resize_size = if width.is_some() && height.is_some() { 1 } else { 0 };
    let px = x.unwrap_or(0.0);
    let py = y.unwrap_or(0.0);
    let pw = width.unwrap_or(0.0);
    let ph = height.unwrap_or(0.0);

    let c_bundle = bundle_id.and_then(|s| CString::new(s).ok());
    let bundle_ptr = c_bundle.as_ref().map(|s| s.as_ptr()).unwrap_or(std::ptr::null());
    let c_name = app_name.and_then(|s| CString::new(s).ok());
    let name_ptr = c_name.as_ref().map(|s| s.as_ptr()).unwrap_or(std::ptr::null());

    let json_str = unsafe {
        let ptr = native_set_app_window_bounds_json(pid, bundle_ptr, name_ptr, px, py, pw, ph, move_pos, resize_size);
        if ptr.is_null() {
            return AppWindowBoundsResult {
                success: false,
                x: px,
                y: py,
                width: pw,
                height: ph,
                app_name: app_name.map(|s| s.to_string()),
                pid: if pid > 0 { Some(pid) } else { None },
            };
        }
        let c_str = std::ffi::CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        native_free_string(ptr);
        s
    };

    serde_json::from_str::<AppWindowBoundsResult>(&json_str).unwrap_or(AppWindowBoundsResult {
        success: true,
        x: px,
        y: py,
        width: pw,
        height: ph,
        app_name: app_name.map(|s| s.to_string()),
        pid: if pid > 0 { Some(pid) } else { None },
    })
}

pub fn activate_app(pid: Option<i32>, bundle_id: Option<&str>, app_name: Option<&str>) -> bool {
    let p = pid.unwrap_or(0);
    let c_bundle = bundle_id.and_then(|s| CString::new(s).ok());
    let c_name = app_name.and_then(|s| CString::new(s).ok());

    let bundle_ptr = c_bundle.as_ref().map(|s| s.as_ptr()).unwrap_or(std::ptr::null());
    let name_ptr = c_name.as_ref().map(|s| s.as_ptr()).unwrap_or(std::ptr::null());

    unsafe {
        native_activate_app_by_pid_or_bundle(p, bundle_ptr, name_ptr) == 1
    }
}

pub fn capture_screen_rect_to_file(x: f64, y: f64, w: f64, h: f64, file_path: &str) -> bool {
    let c_path = match CString::new(file_path) {
        Ok(p) => p,
        Err(_) => return false,
    };
    unsafe {
        native_save_screenshot_rect(x, y, w, h, c_path.as_ptr()) == 1
    }
}



