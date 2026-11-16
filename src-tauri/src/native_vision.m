#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <ImageIO/ImageIO.h>
#import <dlfcn.h>

typedef struct {
    double x;
    double y;
    double width;
    double height;
    int found;
} NativeOCRResult;

typedef CGImageRef (*CGWindowListCreateImageFunc)(CGRect screenBounds, CGWindowListOption listOptions, CGWindowID windowID, CGWindowImageOption imageOptions);

// 精准截取指定 CoreGraphics 矩形区域 (坐标系左上角为 (0,0))
static CGImageRef capture_core_graphics_rect(CGRect captureRect) {
    uint32_t count = 0;
    CGDirectDisplayID displays[8];
    CGDirectDisplayID targetDisplay = CGMainDisplayID();
    
    if (CGGetDisplaysWithRect(captureRect, 8, displays, &count) == kCGErrorSuccess && count > 0) {
        targetDisplay = displays[0];
        CGRect dispBounds = CGDisplayBounds(targetDisplay);
        CGRect localRect = CGRectMake(captureRect.origin.x - dispBounds.origin.x,
                                      captureRect.origin.y - dispBounds.origin.y,
                                      captureRect.size.width,
                                      captureRect.size.height);
        CGImageRef img = CGDisplayCreateImageForRect(targetDisplay, localRect);
        if (img) return img;
    }
    
    // 安全降级回退方案：动态加载 CGWindowListCreateImage
    static CGWindowListCreateImageFunc pCGWindowListCreateImage = NULL;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        pCGWindowListCreateImage = (CGWindowListCreateImageFunc)dlsym(RTLD_DEFAULT, "CGWindowListCreateImage");
    });
    if (pCGWindowListCreateImage) {
        return pCGWindowListCreateImage(captureRect, kCGWindowListOptionOnScreenOnly, kCGNullWindowID, kCGWindowImageDefault);
    }
    return NULL;
}

NativeOCRResult recognize_and_find_text(
    const char *target_c_str,
    int is_fuzzy,
    double roi_x,
    double roi_y,
    double roi_w,
    double roi_h
) {
    __block NativeOCRResult result = {0, 0, 0, 0, 0};

    @autoreleasepool {
        if (!target_c_str) return result;
        NSString *target = [NSString stringWithUTF8String:target_c_str];
        if (!target || target.length == 0) return result;

        NSScreen *primaryScreen = [NSScreen screens].firstObject;
        if (!primaryScreen) return result;
        CGFloat primaryH = primaryScreen.frame.size.height;
        CGFloat primaryW = primaryScreen.frame.size.width;

        CGRect captureRect;
        BOOL isLocalROI = (roi_w > 10.0 && roi_h > 10.0);

        if (isLocalROI) {
            captureRect = CGRectMake(roi_x, roi_y, roi_w, roi_h);
        } else {
            captureRect = CGRectMake(0, 0, primaryW, primaryH);
        }

        CGImageRef screenImage = capture_core_graphics_rect(captureRect);
        if (!screenImage) return result;

        // 保存一份至临时目录供快速排查
        NSURL *tmpUrl = [NSURL fileURLWithPath:@"/tmp/glimpse_captured.png"];
        CGImageDestinationRef dest = CGImageDestinationCreateWithURL((__bridge CFURLRef)tmpUrl, (CFStringRef)@"public.png", 1, NULL);
        if (dest) {
            CGImageDestinationAddImage(dest, screenImage, NULL);
            CGImageDestinationFinalize(dest);
            CFRelease(dest);
        }

        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:^(VNRequest *req, NSError *error) {
            if (error || !req.results) return;

            NSArray *observations = req.results;
            NSString *lowerTarget = [target lowercaseString];
            NSString *cleanTarget = [lowerTarget stringByReplacingOccurrencesOfString:@"：" withString:@""];
            cleanTarget = [cleanTarget stringByReplacingOccurrencesOfString:@":" withString:@""];
            cleanTarget = [cleanTarget stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];

            // 按屏幕从上到下、从左到右自然阅读顺序排序
            NSArray *sortedObservations = [observations sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *a, VNRecognizedTextObservation *b) {
                CGFloat topA = 1.0 - CGRectGetMaxY(a.boundingBox);
                CGFloat topB = 1.0 - CGRectGetMaxY(b.boundingBox);
                if (fabs(topA - topB) > 0.02) {
                    return topA < topB ? NSOrderedAscending : NSOrderedDescending;
                }
                return CGRectGetMinX(a.boundingBox) < CGRectGetMinX(b.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
            }];

            NSMutableArray *allRecognized = [NSMutableArray array];

            for (VNRecognizedTextObservation *obs in sortedObservations) {
                VNRecognizedText *topCandidate = [[obs topCandidates:1] firstObject];
                if (!topCandidate) continue;

                NSString *candidate = [topCandidate.string lowercaseString];
                [allRecognized addObject:topCandidate.string];
                NSString *cleanCandidate = [candidate stringByReplacingOccurrencesOfString:@"：" withString:@""];
                cleanCandidate = [cleanCandidate stringByReplacingOccurrencesOfString:@":" withString:@""];
                cleanCandidate = [cleanCandidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];

                NSCharacterSet *impuritySet = [NSCharacterSet characterSetWithCharactersInString:@"0123456789•°$#* \t\r\n"];
                NSString *strippedCandidate = [cleanCandidate stringByTrimmingCharactersInSet:impuritySet];

                BOOL matched = NO;
                if (is_fuzzy) {
                    matched = [candidate containsString:lowerTarget] ||
                              (cleanTarget.length > 0 && [cleanCandidate containsString:cleanTarget]) ||
                              (cleanTarget.length > 0 && [strippedCandidate containsString:cleanTarget]);
                } else {
                    matched = [candidate isEqualToString:lowerTarget] ||
                              (cleanTarget.length > 0 && [cleanCandidate isEqualToString:cleanTarget]);
                }

                if (matched) {
                    CGRect box = obs.boundingBox; // Vision 归一化坐标：原点在左下角 (0,0)
                    CGFloat normCenterX = CGRectGetMidX(box);
                    CGFloat normCenterY = 1.0 - CGRectGetMidY(box); // 转换为左上角为原点

                    // 使用 Apple Vision 原生 boundingBoxForRange 提取子字符串精确范围
                    NSRange subRange = [topCandidate.string rangeOfString:target options:NSCaseInsensitiveSearch];
                    if (subRange.location == NSNotFound && cleanTarget.length > 0) {
                        subRange = [topCandidate.string rangeOfString:cleanTarget options:NSCaseInsensitiveSearch];
                    }

                    if (subRange.location != NSNotFound) {
                        NSError *rangeErr = nil;
                        VNRectangleObservation *subObs = [topCandidate boundingBoxForRange:subRange error:&rangeErr];
                        if (subObs && !rangeErr) {
                            box = subObs.boundingBox;
                            normCenterX = CGRectGetMidX(box);
                            normCenterY = 1.0 - CGRectGetMidY(box);
                        }
                    }

                    if (isLocalROI) {
                        result.x = roi_x + (normCenterX * roi_w);
                        result.y = roi_y + (normCenterY * roi_h);
                        result.width = box.size.width * roi_w;
                        result.height = box.size.height * roi_h;
                    } else {
                        result.x = normCenterX * primaryW;
                        result.y = normCenterY * primaryH;
                        result.width = box.size.width * primaryW;
                        result.height = box.size.height * primaryH;
                    }
                    result.found = 1;
                    break;
                }
            }

            if (result.found == 0 && allRecognized.count > 0) {
                NSString *joined = [allRecognized componentsJoinedByString:@"\n"];
                [joined writeToFile:@"/tmp/glimpse_ocr_candidates.txt" atomically:YES encoding:NSUTF8StringEncoding error:nil];
            } else if (result.found == 1) {
                [@"" writeToFile:@"/tmp/glimpse_ocr_candidates.txt" atomically:YES encoding:NSUTF8StringEncoding error:nil];
            }
        }];

        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        request.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"en-US"];
        request.usesLanguageCorrection = YES;

        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:screenImage options:@{}];
        [handler performRequests:@[request] error:nil];
        CGImageRelease(screenImage);
    }

    return result;
}

int native_save_screenshot_rect(double x, double y, double w, double h, const char *file_path) {
    if (!file_path) return 0;
    @autoreleasepool {
        NSScreen *primaryScreen = [NSScreen screens].firstObject;
        if (!primaryScreen) return 0;
        CGFloat primaryH = primaryScreen.frame.size.height;
        CGFloat primaryW = primaryScreen.frame.size.width;

        CGRect captureRect;
        if (w > 5.0 && h > 5.0) {
            captureRect = CGRectMake(x, y, w, h);
        } else {
            captureRect = CGRectMake(0, 0, primaryW, primaryH);
        }

        CGImageRef screenImage = capture_core_graphics_rect(captureRect);
        if (!screenImage) return 0;

        NSString *pathStr = [NSString stringWithUTF8String:file_path];
        NSString *parentDir = [pathStr stringByDeletingLastPathComponent];
        [[NSFileManager defaultManager] createDirectoryAtPath:parentDir withIntermediateDirectories:YES attributes:nil error:nil];

        NSURL *fileUrl = [NSURL fileURLWithPath:pathStr];
        CGImageDestinationRef dest = CGImageDestinationCreateWithURL((__bridge CFURLRef)fileUrl, (CFStringRef)@"public.png", 1, NULL);
        int success = 0;
        if (dest) {
            CGImageDestinationAddImage(dest, screenImage, NULL);
            if (CGImageDestinationFinalize(dest)) {
                success = 1;
            }
            CFRelease(dest);
        }
        CGImageRelease(screenImage);
        return success;
    }
}

int native_check_accessibility(void) {
    if (!AXIsProcessTrusted()) {
        return 0;
    }
    if (@available(macOS 10.15, *)) {
        return CGPreflightPostEventAccess() ? 1 : 0;
    }
    return 1;
}

void native_open_accessibility_pref(void) {
    if (@available(macOS 10.15, *)) {
        CGRequestPostEventAccess();
    }
    NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}

int native_check_screen_recording(void) {
    if (@available(macOS 10.15, *)) {
        return CGPreflightScreenCaptureAccess() ? 1 : 0;
    }
    return 1;
}

void native_request_screen_recording(void) {
    if (@available(macOS 10.15, *)) {
        CGRequestScreenCaptureAccess();
    }
    NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}
