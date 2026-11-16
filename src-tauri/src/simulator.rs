use core_graphics::event::{CGEvent, CGEventTapLocation, CGEventType, CGMouseButton};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGPoint;
use std::thread::sleep;
use std::time::Duration;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreateScrollWheelEvent2(
        source: *const std::ffi::c_void,
        units: u32,
        wheel_count: u32,
        wheel1: i32,
        wheel2: i32,
        wheel3: i32,
    ) -> *mut std::ffi::c_void;
    fn CGEventPost(tap_location: u32, event: *mut std::ffi::c_void);
    fn CFRelease(cf: *const std::ffi::c_void);
}

fn post_event(event: &CGEvent) {
    event.post(CGEventTapLocation::HID);
}

fn create_event_source() -> Result<CGEventSource, String> {
    CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .or_else(|_| CGEventSource::new(CGEventSourceStateID::CombinedSessionState))
        .map_err(|_| "创建 CGEventSource 失败".to_string())
}

fn extract_pid(json: &str) -> Option<&str> {
    let pos = json.find("\"pid\":")?;
    let rest = &json[pos + 6..];
    let end = rest.find(',').or_else(|| rest.find('}')).unwrap_or(rest.len());
    Some(rest[..end].trim())
}

fn activate_if_needed(x: f64, y: f64) {
    let front = crate::ocr::get_frontmost_app_json();
    let target = crate::ocr::get_app_at_point_json(x, y);
    let skip_activate = match (extract_pid(&front), extract_pid(&target)) {
        (Some(pf), Some(pt)) => pf == pt,
        _ => false,
    };
    if !skip_activate {
        crate::ocr::activate_window_at(x, y);
        sleep(Duration::from_millis(180));
    }
}

pub fn click_at(x: f64, y: f64, button: &str) -> Result<(), String> {
    if !crate::ocr::is_accessibility_trusted() {
        return Err("Glimpse 未获得 macOS 辅助功能权限，无法派发鼠标事件。请在系统设置中授权。".to_string());
    }

    let is_right = button == "right";
    let is_double = button == "double";

    // 1. 确保蒙版窗口处于穿透状态
    crate::ocr::ensure_mask_passthrough();

    // 2. 仅左键/双击时激活目标窗口；右键不激活——激活会抢焦点导致上下文菜单被系统关闭
    if !is_right {
        activate_if_needed(x, y);
    }

    let point = CGPoint::new(x, y);
    let source = create_event_source()?;

    // 3. 派发 MouseMoved 事件，确保系统与目标窗口光标及 Hover 状态完全同步
    let move_event = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::MouseMoved,
        point,
        CGMouseButton::Left,
    )
    .map_err(|_| "创建 MouseMoved 事件失败".to_string())?;
    post_event(&move_event);
    sleep(Duration::from_millis(50));

    let (down_type, up_type, mouse_btn, btn_number) = if is_right {
        (CGEventType::RightMouseDown, CGEventType::RightMouseUp, CGMouseButton::Right, 1i64)
    } else {
        (CGEventType::LeftMouseDown, CGEventType::LeftMouseUp, CGMouseButton::Left, 0i64)
    };

    let clicks = if is_double { 2 } else { 1 };

    for i in 1..=clicks {
        let down_event = CGEvent::new_mouse_event(source.clone(), down_type, point, mouse_btn)
            .map_err(|_| "创建 MouseDown 事件失败".to_string())?;
        down_event.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_CLICK_STATE,
            i as i64,
        );
        down_event.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_BUTTON_NUMBER,
            btn_number,
        );
        post_event(&down_event);
        sleep(Duration::from_millis(60));

        let up_event = CGEvent::new_mouse_event(source.clone(), up_type, point, mouse_btn)
            .map_err(|_| "创建 MouseUp 事件失败".to_string())?;
        up_event.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_CLICK_STATE,
            i as i64,
        );
        up_event.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_BUTTON_NUMBER,
            btn_number,
        );
        post_event(&up_event);

        if i < clicks {
            sleep(Duration::from_millis(60));
        }
    }

    if is_right {
        // 右键弹出菜单需要等待系统/目标应用完成动画展开
        sleep(Duration::from_millis(200));
    } else {
        sleep(Duration::from_millis(50));
    }

    Ok(())
}

/// 拖动直线：从起点 (x1, y1) 直线拖拽到终点 (x2, y2)，耗时 duration_secs 秒
pub fn drag_line(x1: f64, y1: f64, x2: f64, y2: f64, duration_secs: f64) -> Result<(), String> {
    crate::ocr::ensure_mask_passthrough();
    activate_if_needed(x1, y1);

    let source = create_event_source()?;

    let start_point = CGPoint::new(x1, y1);
    let end_point = CGPoint::new(x2, y2);

    // 1. 光标移动到起点
    if let Ok(move_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::MouseMoved,
        start_point,
        CGMouseButton::Left,
    ) {
        post_event(&move_event);
    }
    sleep(Duration::from_millis(40));

    // 2. 按下左键
    if let Ok(down_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::LeftMouseDown,
        start_point,
        CGMouseButton::Left,
    ) {
        post_event(&down_event);
    }
    sleep(Duration::from_millis(40));

    // 3. 平滑插值拖动
    let d = duration_secs.max(0.1);
    let steps = ((d * 60.0) as i32).clamp(10, 180);
    let step_delay = Duration::from_secs_f64(d / (steps as f64));

    for i in 1..=steps {
        let t = (i as f64) / (steps as f64);
        let cur_x = x1 + (x2 - x1) * t;
        let cur_y = y1 + (y2 - y1) * t;
        let cur_point = CGPoint::new(cur_x, cur_y);

        if let Ok(drag_event) = CGEvent::new_mouse_event(
            source.clone(),
            CGEventType::LeftMouseDragged,
            cur_point,
            CGMouseButton::Left,
        ) {
            post_event(&drag_event);
        }
        sleep(step_delay);
    }

    // 4. 释放左键
    if let Ok(up_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::LeftMouseUp,
        end_point,
        CGMouseButton::Left,
    ) {
        post_event(&up_event);
    }
    sleep(Duration::from_millis(30));

    Ok(())
}

/// 拖动曲线：沿二次贝塞尔曲线轨迹平滑拖动 (起点 -> 控制点 -> 终点)
pub fn drag_curve(
    x1: f64,
    y1: f64,
    cx: f64,
    cy: f64,
    x2: f64,
    y2: f64,
    duration_secs: f64,
) -> Result<(), String> {
    crate::ocr::ensure_mask_passthrough();
    activate_if_needed(x1, y1);

    let source = create_event_source()?;

    let start_point = CGPoint::new(x1, y1);
    let end_point = CGPoint::new(x2, y2);

    // 1. 光标移动到起点
    if let Ok(move_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::MouseMoved,
        start_point,
        CGMouseButton::Left,
    ) {
        post_event(&move_event);
    }
    sleep(Duration::from_millis(40));

    // 2. 按下左键
    if let Ok(down_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::LeftMouseDown,
        start_point,
        CGMouseButton::Left,
    ) {
        post_event(&down_event);
    }
    sleep(Duration::from_millis(40));

    // 3. 沿贝塞尔曲线拖动
    let d = duration_secs.max(0.1);
    let steps = ((d * 60.0) as i32).clamp(15, 240);
    let step_delay = Duration::from_secs_f64(d / (steps as f64));

    for i in 1..=steps {
        let t = (i as f64) / (steps as f64);
        let u = 1.0 - t;
        let cur_x = u * u * x1 + 2.0 * u * t * cx + t * t * x2;
        let cur_y = u * u * y1 + 2.0 * u * t * cy + t * t * y2;
        let cur_point = CGPoint::new(cur_x, cur_y);

        if let Ok(drag_event) = CGEvent::new_mouse_event(
            source.clone(),
            CGEventType::LeftMouseDragged,
            cur_point,
            CGMouseButton::Left,
        ) {
            post_event(&drag_event);
        }
        sleep(step_delay);
    }

    // 4. 释放左键
    if let Ok(up_event) = CGEvent::new_mouse_event(
        source.clone(),
        CGEventType::LeftMouseUp,
        end_point,
        CGMouseButton::Left,
    ) {
        post_event(&up_event);
    }
    sleep(Duration::from_millis(30));

    Ok(())
}

/// 鼠标滚轮滚动：向上或向下滚动指定步数/距离
pub fn scroll(direction: &str, distance: i32, x: Option<f64>, y: Option<f64>) -> Result<(), String> {
    crate::ocr::ensure_mask_passthrough();
    let source = create_event_source()?;

    // 如果指定了位置，先激活窗口并移动光标
    if let (Some(px), Some(py)) = (x, y) {
        crate::ocr::activate_window_at(px, py);
        let point = CGPoint::new(px, py);

        if let Ok(move_event) = CGEvent::new_mouse_event(
            source.clone(),
            CGEventType::MouseMoved,
            point,
            CGMouseButton::Left,
        ) {
            post_event(&move_event);
        }
        sleep(Duration::from_millis(30));
    }

    let delta_sign = if direction == "down" { -1 } else { 1 };
    let steps = distance.abs().clamp(1, 200);

    for _ in 0..steps {
        unsafe {
            // kCGScrollEventUnitLine = 1
            let event = CGEventCreateScrollWheelEvent2(
                std::ptr::null(),
                1,
                1,
                delta_sign * 2,
                0,
                0,
            );
            if !event.is_null() {
                // 向系统级底层 kCGHIDEventTap (0) 派发
                CGEventPost(0, event);
                CFRelease(event);
            }
        }
        sleep(Duration::from_millis(25));
    }

    Ok(())
}
