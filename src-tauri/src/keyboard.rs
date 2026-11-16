use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use std::thread::sleep;
use std::time::Duration;

fn create_event_source() -> Result<CGEventSource, String> {
    CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .or_else(|_| CGEventSource::new(CGEventSourceStateID::CombinedSessionState))
        .map_err(|_| "创建 CGEventSource 失败".to_string())
}

/// 将常见按键名称映射到 macOS 虚拟键码 (CGKeyCode) 及是否需要 Shift 修饰键
fn map_key_name(raw: &str) -> Option<(CGKeyCode, bool)> {
    let lower = raw.trim().to_ascii_lowercase();
    let code: CGKeyCode = match lower.as_str() {
        // 字母 A-Z (ANSI)
        "a" => 0, "s" => 1, "d" => 2, "f" => 3, "h" => 4, "g" => 5,
        "z" => 6, "x" => 7, "c" => 8, "v" => 9, "b" => 11, "q" => 12,
        "w" => 13, "e" => 14, "r" => 15, "y" => 16, "t" => 17, "o" => 31,
        "u" => 32, "i" => 34, "p" => 35, "l" => 37, "j" => 38, "k" => 40,
        "n" => 45, "m" => 46,
        // 数字 0-9
        "1" => 18, "2" => 19, "3" => 20, "4" => 21, "6" => 22,
        "5" => 23, "9" => 25, "7" => 26, "8" => 28, "0" => 29,
        // 常用控制键
        "enter" | "return" | "ret" | "回车" => 36,
        "tab" => 48,
        "space" | " " | "空格" => 49,
        "backspace" | "bksp" => 51,
        "delete" | "del" | "forwarddelete" => 117,
        "esc" | "escape" => 53,
        "capslock" => 57,
        // 方向键与导航键
        "left" | "arrowleft" | "←" => 123,
        "right" | "arrowright" | "→" => 124,
        "down" | "arrowdown" | "↓" => 125,
        "up" | "arrowup" | "↑" => 126,
        "home" => 115,
        "end" => 119,
        "pageup" | "pgup" => 116,
        "pagedown" | "pgdn" => 121,
        // 功能键 F1-F12
        "f1" => 122, "f2" => 120, "f3" => 99, "f4" => 118,
        "f5" => 96, "f6" => 97, "f7" => 98, "f8" => 100,
        "f9" => 101, "f10" => 109, "f11" => 103, "f12" => 111,
        // 标点符号（无 Shift）
        "-" | "minus" => 27,
        "=" | "equal" => 24,
        "[" | "bracketleft" => 33,
        "]" | "bracketright" => 30,
        "\\" | "backslash" => 42,
        ";" | "semicolon" => 41,
        "'" | "quote" => 39,
        "," | "comma" => 43,
        "." | "period" => 47,
        "/" | "slash" => 44,
        "`" | "backquote" => 50,
        // 修饰键（单独按下）
        "cmd" | "command" | "meta" | "super" => 55,
        "shift" => 56,
        "alt" | "option" | "opt" => 58,
        "ctrl" | "control" => 59,
        _ => {
            // 需要 Shift 的符号
            let shifted = match raw.trim() {
                "!" => 18, "@" => 19, "#" => 20, "$" => 21, "%" => 23,
                "^" => 22, "&" => 26, "*" => 28, "(" => 25, ")" => 29,
                "_" => 27, "+" | "plus" => 24, "{" => 33, "}" => 30, "|" => 42,
                ":" => 41, "\"" => 39, "<" => 43, ">" => 47, "?" => 44, "~" => 50,
                _ => return None,
            };
            return Some((shifted, true));
        }
    };
    Some((code, false))
}

fn parse_key_combo(combo: &str) -> Result<(CGKeyCode, CGEventFlags), String> {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return Err("按键配置为空".to_string());
    }

    // 单独的 "+" 按键
    if trimmed == "+" {
        let (code, need_shift) = map_key_name("+").unwrap();
        let flags = if need_shift {
            CGEventFlags::CGEventFlagShift
        } else {
            CGEventFlags::empty()
        };
        return Ok((code, flags));
    }

    let parts: Vec<&str> = trimmed.split('+').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return Err(format!("无效的按键格式: {}", combo));
    }

    let mut flags = CGEventFlags::empty();
    let key_part = parts[parts.len() - 1];

    for &mod_str in &parts[..parts.len() - 1] {
        match mod_str.to_ascii_lowercase().as_str() {
            "cmd" | "command" | "meta" | "super" | "⌘" => flags |= CGEventFlags::CGEventFlagCommand,
            "ctrl" | "control" | "⌃" => flags |= CGEventFlags::CGEventFlagControl,
            "alt" | "option" | "opt" | "⌥" => flags |= CGEventFlags::CGEventFlagAlternate,
            "shift" | "⇧" => flags |= CGEventFlags::CGEventFlagShift,
            other => return Err(format!("未知的修饰键: {}", other)),
        }
    }

    let (code, need_shift) = map_key_name(key_part)
        .ok_or_else(|| format!("不支持的按键: {}", key_part))?;

    if need_shift {
        flags |= CGEventFlags::CGEventFlagShift;
    }

    Ok((code, flags))
}

/// 派发键盘按键或组合键（严格投递至底层 CGEventTapLocation::HID）
pub fn send_key(key: &str, repeat: u32) -> Result<(), String> {
    if !crate::ocr::is_accessibility_trusted() {
        return Err("Glimpse 未获得 macOS 辅助功能权限，无法派发键盘事件。请在系统设置中授权。".to_string());
    }

    crate::ocr::ensure_mask_passthrough();
    let (keycode, flags) = parse_key_combo(key)?;
    let source = create_event_source()?;
    let count = repeat.clamp(1, 50);

    for i in 0..count {
        let down = CGEvent::new_keyboard_event(source.clone(), keycode, true)
            .map_err(|_| "创建 KeyDown 事件失败".to_string())?;
        if !flags.is_empty() {
            down.set_flags(flags);
        }
        down.post(CGEventTapLocation::HID);

        sleep(Duration::from_millis(30));

        let up = CGEvent::new_keyboard_event(source.clone(), keycode, false)
            .map_err(|_| "创建 KeyUp 事件失败".to_string())?;
        if !flags.is_empty() {
            up.set_flags(flags);
        }
        up.post(CGEventTapLocation::HID);

        if i + 1 < count {
            sleep(Duration::from_millis(45));
        }
    }

    sleep(Duration::from_millis(40));
    Ok(())
}
