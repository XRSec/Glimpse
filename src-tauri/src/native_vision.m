#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>
#import <dlfcn.h>
#import <objc/runtime.h>

typedef struct {
    double x;
    double y;
    int found;
} NativeOCRResult;

typedef CGImageRef (*CGDisplayCreateImageFunc)(CGDirectDisplayID displayID);
typedef CGImageRef (*CGWindowListCreateImageFunc)(CGRect screenBounds, CGWindowListOption listOptions, CGWindowID windowID, CGWindowImageOption imageOptions);

static CGImageRef capture_screen_image(CGRect screenRect, CGDirectDisplayID displayID) {
    static CGDisplayCreateImageFunc pCGDisplayCreateImage = NULL;
    static CGWindowListCreateImageFunc pCGWindowListCreateImage = NULL;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        pCGDisplayCreateImage = (CGDisplayCreateImageFunc)dlsym(RTLD_DEFAULT, "CGDisplayCreateImage");
        pCGWindowListCreateImage = (CGWindowListCreateImageFunc)dlsym(RTLD_DEFAULT, "CGWindowListCreateImage");
    });

    CGImageRef img = NULL;
    if (pCGDisplayCreateImage) {
        img = pCGDisplayCreateImage(displayID);
    }
    if (!img && pCGWindowListCreateImage) {
        img = pCGWindowListCreateImage(screenRect, kCGWindowListOptionOnScreenOnly, kCGNullWindowID, kCGWindowImageDefault);
    }
    return img;
}

NativeOCRResult recognize_and_find_text(
    const char *target_c_str,
    int is_fuzzy,
    double roi_x,
    double roi_y,
    double roi_w,
    double roi_h
) {
    __block NativeOCRResult result = {0, 0, 0};

    @autoreleasepool {
        if (!target_c_str) return result;
        NSString *target = [NSString stringWithUTF8String:target_c_str];
        if (!target || target.length == 0) return result;

        NSScreen *mainScreen = [NSScreen mainScreen];
        if (!mainScreen) return result;

        CGRect screenRect = mainScreen.frame;
        CGDirectDisplayID displayID = (CGDirectDisplayID)[[[mainScreen deviceDescription] objectForKey:@"NSScreenNumber"] unsignedIntValue];

        CGImageRef screenImage = capture_screen_image(screenRect, displayID);
        if (!screenImage) return result;

        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:^(VNRequest *req, NSError *error) {
            if (error || !req.results) return;

            NSArray *observations = req.results;
            NSString *lowerTarget = [target lowercaseString];

            for (VNRecognizedTextObservation *obs in observations) {
                VNRecognizedText *topCandidate = [[obs topCandidates:1] firstObject];
                if (!topCandidate) continue;

                NSString *candidate = [topCandidate.string lowercaseString];
                BOOL matched = NO;

                if (is_fuzzy) {
                    matched = [candidate containsString:lowerTarget] || [lowerTarget containsString:candidate];
                } else {
                    matched = [candidate isEqualToString:lowerTarget];
                }

                if (matched) {
                    CGRect box = obs.boundingBox;
                    CGFloat normCenterX = CGRectGetMidX(box);
                    CGFloat normCenterY = 1.0 - CGRectGetMidY(box);

                    CGFloat screenX = screenRect.origin.x + (normCenterX * screenRect.size.width);
                    CGFloat screenY = screenRect.origin.y + (normCenterY * screenRect.size.height);

                    if (roi_w > 0 && roi_h > 0) {
                        if (screenX < roi_x || screenX > (roi_x + roi_w) ||
                            screenY < roi_y || screenY > (roi_y + roi_h)) {
                            continue;
                        }
                    }

                    result.x = screenX;
                    result.y = screenY;
                    result.found = 1;
                    break;
                }
            }
        }];

        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        request.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"en-US"];
        request.usesLanguageCorrection = YES;

        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:screenImage options:@{}];
        NSError *performError = nil;
        [handler performRequests:@[request] error:&performError];

        CGImageRelease(screenImage);
    }

    return result;
}

int native_check_accessibility(void) {
    return AXIsProcessTrusted() ? 1 : 0;
}

void native_open_accessibility_pref(void) {
    NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}

// -------------------------------------------------------------
// 递归关闭 WKWebView 及所有容器 View 的背景绘制，实现真 100% 透明通道
// -------------------------------------------------------------
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
static NSWindow *s_maskWindow = nil;
static NSTimer *s_mouseMonitorTimer = nil;
static BOOL s_currentIgnores = NO;
static int s_interactiveOverride = 0;
static BOOL s_isDraggingActive = NO;

static void update_mask_mouse_location(void) {
    if (!s_maskWindow) return;
    if (![s_maskWindow isVisible]) return;

    // 选区模式或强制交互状态下，整窗保持可响应
    if (s_interactiveOverride) {
        if (s_currentIgnores) {
            [s_maskWindow setIgnoresMouseEvents:NO];
            s_currentIgnores = NO;
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

    // 如果鼠标按键已经松开，重置拖动交互锁定状态
    if (!leftPressed) {
        s_isDraggingActive = NO;
    }

    // 1. 顶部刘海交互区：水平居中 220px，垂直顶部 32px (精准贴紧，下方无死区)
    CGFloat notchW = 220.0;
    CGFloat notchLeft = (w - notchW) / 2.0;
    CGFloat notchRight = (w + notchW) / 2.0;
    BOOL inNotch = insideWindow && (relX >= notchLeft && relX <= notchRight && relY >= (h - 32.0) && relY <= h);

    // 2. 四周边缘 14px 边框交互区 (用于边缘拉伸和尺寸调整)
    BOOL inBorder = insideWindow && (relX <= 14.0 || relX >= (w - 14.0) || relY <= 14.0 || relY >= (h - 14.0));

    // 3. 右下角手柄交互区 (30px x 30px)
    BOOL inHandle = insideWindow && (relX >= (w - 30.0) && relY <= 30.0);

    BOOL inInteractiveArea = (inNotch || inBorder || inHandle);

    // 如果在交互区按下了鼠标左键，锁定交互状态直至松手（防止快速拖拽中途切为穿透）
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

        // 默认设置为穿透，保证一打开时中间区域就是击穿到底层的
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

void native_perform_window_drag(void *window_ptr) {
    if (!window_ptr) return;
    NSWindow *window = (NSWindow *)window_ptr;
    NSEvent *event = [NSApp currentEvent];
    if (event) {
        [window performWindowDragWithEvent:event];
    }
}
