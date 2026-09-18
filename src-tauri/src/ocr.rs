use std::ffi::CString;
use std::os::raw::{c_char, c_int};

#[repr(C)]
struct NativeOCRResult {
    x: f64,
    y: f64,
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
    fn start_dynamic_mask_passthrough(window_ptr: *mut std::ffi::c_void);
    fn native_perform_window_drag(window_ptr: *mut std::ffi::c_void);
    fn set_mask_selecting_mode(is_selecting: c_int);
}

pub struct FoundTextLocation {
    pub x: f64,
    pub y: f64,
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
            Some(FoundTextLocation { x: res.x, y: res.y })
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

pub fn apply_mask_window_passthrough(window_ptr: *mut std::ffi::c_void) {
    unsafe { start_dynamic_mask_passthrough(window_ptr) }
}

pub fn drag_mask_window(window_ptr: *mut std::ffi::c_void) {
    unsafe { native_perform_window_drag(window_ptr) }
}

pub fn set_mask_selecting_state(selecting: bool) {
    unsafe { set_mask_selecting_mode(if selecting { 1 } else { 0 }) }
}
