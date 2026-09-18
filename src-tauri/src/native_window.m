#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

// 全局悬浮蒙版窗口实例指针
static NSWindow *s_maskWindow = nil;

NSWindow *native_get_mask_window(void) {
    return s_maskWindow;
}

// 递归关闭 WKWebView 背景绘制，实现 100% 透明通道
static void make_view_transparent(NSView *view) {
    if (!view) return;

    SEL drawsBgSel = NSSelectorFromString(@"setDrawsBackground:");
    if ([view respondsToSelector:drawsBgSel]) {
        void (*func)(id, SEL, BOOL) = (void (*)(id, SEL, BOOL))[view methodForSelector:drawsBgSel];
        if (func) func(view, drawsBgSel, NO);
    }

    if ([view layer]) {
        [[view layer] setBackgroundColor:NULL];
        [[view layer] setOpaque:NO];
    }

    for (NSView *sub in [view subviews]) {
        make_view_transparent(sub);
    }
}

// -------------------------------------------------------------
// 全局动态穿透状态管理 (60fps 屏幕绝对物理坐标无缝动态切换)
// -------------------------------------------------------------
static NSTimer *s_mouseMonitorTimer = nil;
static BOOL s_currentIgnores = NO;
static int s_interactiveOverride = 0;
static BOOL s_isDraggingActive = NO;

static void update_mask_mouse_location(void) {
    if (!s_maskWindow || ![s_maskWindow isVisible]) return;

    if (s_interactiveOverride == 1) {
        if (s_currentIgnores) {
            [s_maskWindow setIgnoresMouseEvents:NO];
            s_currentIgnores = NO;
        }
        return;
    } else if (s_interactiveOverride == 2) {
        if (!s_currentIgnores) {
            [s_maskWindow setIgnoresMouseEvents:YES];
            s_currentIgnores = YES;
        }
        return;
    }

    NSRect frame = [s_maskWindow frame];
    NSPoint mouse = [NSEvent mouseLocation];

    CGFloat w = frame.size.width;
    CGFloat h = frame.size.height;
    CGFloat relX = mouse.x - frame.origin.x;
    CGFloat relY = mouse.y - frame.origin.y;

    BOOL insideWindow = (relX >= 0.0 && relX <= w && relY >= 0.0 && relY <= h);
    NSUInteger pressed = [NSEvent pressedMouseButtons];
    BOOL leftPressed = (pressed & 1) != 0;

    if (!leftPressed) {
        s_isDraggingActive = NO;
    }

    CGFloat notchW = 220.0;
    CGFloat notchLeft = (w - notchW) / 2.0;
    CGFloat notchRight = (w + notchW) / 2.0;
    BOOL inNotch = insideWindow && (relX >= notchLeft && relX <= notchRight && relY >= (h - 32.0) && relY <= h);
    BOOL inBorder = insideWindow && (relX <= 14.0 || relX >= (w - 14.0) || relY <= 14.0 || relY >= (h - 14.0));
    BOOL inHandle = insideWindow && (relX >= (w - 30.0) && relY <= 30.0);

    BOOL inInteractiveArea = (inNotch || inBorder || inHandle);
    if (inInteractiveArea && leftPressed) {
        s_isDraggingActive = YES;
    }

    BOOL shouldBeInteractive = inInteractiveArea || s_isDraggingActive;
    BOOL targetIgnores = !shouldBeInteractive;

    if (targetIgnores != s_currentIgnores) {
        [s_maskWindow setIgnoresMouseEvents:targetIgnores];
        s_currentIgnores = targetIgnores;
    }
}

void start_dynamic_mask_passthrough(void *window_ptr) {
    if (!window_ptr) return;

    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = (NSWindow *)window_ptr;
        s_maskWindow = window;

        [window setOpaque:NO];
        [window setBackgroundColor:[NSColor clearColor]];
        [window setHasShadow:NO];
        [window setLevel:NSFloatingWindowLevel];

        [window setIgnoresMouseEvents:YES];
        s_currentIgnores = YES;
        s_isDraggingActive = NO;

        make_view_transparent([window contentView]);

        if (s_mouseMonitorTimer) {
            [s_mouseMonitorTimer invalidate];
            s_mouseMonitorTimer = nil;
        }

        s_mouseMonitorTimer = [NSTimer timerWithTimeInterval:0.016
                                                     repeats:YES
                                                       block:^(NSTimer * _Nonnull timer) {
            (void)timer;
            update_mask_mouse_location();
        }];
        [[NSRunLoop mainRunLoop] addTimer:s_mouseMonitorTimer forMode:NSRunLoopCommonModes];
    });
}

void set_mask_selecting_mode(int is_selecting) {
    s_interactiveOverride = is_selecting;
    if (s_maskWindow) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (is_selecting) {
                [s_maskWindow setIgnoresMouseEvents:NO];
                s_currentIgnores = NO;
            } else {
                [s_maskWindow setIgnoresMouseEvents:YES];
                s_currentIgnores = YES;
            }
        });
    }
}

void native_ensure_mask_passthrough(void) {
    s_interactiveOverride = 2;
    if (s_maskWindow) {
        if ([NSThread isMainThread]) {
            [s_maskWindow setIgnoresMouseEvents:YES];
            s_currentIgnores = YES;
        } else {
            dispatch_sync(dispatch_get_main_queue(), ^{
                [s_maskWindow setIgnoresMouseEvents:YES];
                s_currentIgnores = YES;
            });
        }
    }
}

void native_perform_window_drag(void *window_ptr) {
    if (!window_ptr) return;
    NSWindow *window = (NSWindow *)window_ptr;
    NSEvent *event = [NSApp currentEvent];
    if (event) {
        [window performWindowDragWithEvent:event];
    }
}

// -------------------------------------------------------------
// 全局鼠标动作智能录制
// -------------------------------------------------------------
typedef void (*NativeClickCallback)(double x, double y, const char *button);
static NativeClickCallback s_recordingCallback = NULL;
static id s_globalMouseMonitor = nil;
static id s_localMouseMonitor = nil;

void native_start_mouse_recording(NativeClickCallback callback) {
    if (s_globalMouseMonitor != nil || s_localMouseMonitor != nil) return;
    s_recordingCallback = callback;

    NSEventMask mask = NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown;

    s_globalMouseMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:^(NSEvent *event) {
        if (!s_recordingCallback) return;
        NSPoint loc = [NSEvent mouseLocation];
        NSScreen *primary = [NSScreen screens].firstObject;
        CGFloat primaryH = primary ? primary.frame.size.height : 900.0;
        double cg_x = loc.x;
        double cg_y = primaryH - loc.y;

        const char *btn = "left";
        if (event.type == NSEventTypeRightMouseDown) {
            btn = "right";
        } else if (event.clickCount >= 2) {
            btn = "double";
        }
        s_recordingCallback(cg_x, cg_y, btn);
    }];

    s_localMouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        if (s_recordingCallback) {
            NSWindow *win = [event window];
            if (win == nil || win == s_maskWindow) {
                NSPoint loc = [NSEvent mouseLocation];
                NSScreen *primary = [NSScreen screens].firstObject;
                CGFloat primaryH = primary ? primary.frame.size.height : 900.0;
                double cg_x = loc.x;
                double cg_y = primaryH - loc.y;

                const char *btn = "left";
                if (event.type == NSEventTypeRightMouseDown) {
                    btn = "right";
                } else if (event.clickCount >= 2) {
                    btn = "double";
                }
                s_recordingCallback(cg_x, cg_y, btn);
            }
        }
        return event;
    }];
}

void native_stop_mouse_recording(void) {
    if (s_globalMouseMonitor) {
        [NSEvent removeMonitor:s_globalMouseMonitor];
        s_globalMouseMonitor = nil;
    }
    if (s_localMouseMonitor) {
        [NSEvent removeMonitor:s_localMouseMonitor];
        s_localMouseMonitor = nil;
    }
    s_recordingCallback = NULL;
}

// -------------------------------------------------------------
// 全局快捷键 ESC 紧急中断监听器
// -------------------------------------------------------------
typedef void (*NativeEscCallback)(void);
static NativeEscCallback s_escCallback = NULL;
static id s_globalEscMonitor = nil;
static id s_localEscMonitor = nil;

void native_init_global_esc_monitor(NativeEscCallback callback) {
    s_escCallback = callback;
    if (s_globalEscMonitor != nil || s_localEscMonitor != nil) return;

    s_globalEscMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^(NSEvent *event) {
        if ([event keyCode] == 53) {
            s_interactiveOverride = 0;
            if (s_maskWindow) {
                [s_maskWindow setIgnoresMouseEvents:YES];
                s_currentIgnores = YES;
            }
            if (s_escCallback) s_escCallback();
        }
    }];

    s_localEscMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
        if ([event keyCode] == 53) {
            s_interactiveOverride = 0;
            if (s_maskWindow) {
                [s_maskWindow setIgnoresMouseEvents:YES];
                s_currentIgnores = YES;
            }
            if (s_escCallback) s_escCallback();
        }
        return event;
    }];
}

void native_free_string(char *ptr) {
    if (ptr) free(ptr);
}
