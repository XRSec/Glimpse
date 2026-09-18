#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

// -------------------------------------------------------------
// 系统级鲁棒激活应用程序 (兼容 macOS 14 Sonoma 及 macOS 15 Sequoia)
// 结合 Accessibility API + AppleScript + NSWorkspace 三重穿透置顶
// -------------------------------------------------------------
static void activate_app_robust(NSRunningApplication *targetApp) {
    if (!targetApp) return;
    pid_t pid = targetApp.processIdentifier;

    AXUIElementRef appRef = AXUIElementCreateApplication(pid);
    if (appRef) {
        AXUIElementSetAttributeValue(appRef, (CFStringRef)NSAccessibilityFrontmostAttribute, kCFBooleanTrue);
        CFTypeRef winRef = NULL;
        if (AXUIElementCopyAttributeValue(appRef, (CFStringRef)NSAccessibilityMainWindowAttribute, &winRef) == kAXErrorSuccess && winRef) {
            AXUIElementPerformAction((AXUIElementRef)winRef, (CFStringRef)NSAccessibilityRaiseAction);
            CFRelease(winRef);
        } else if (AXUIElementCopyAttributeValue(appRef, (CFStringRef)NSAccessibilityFocusedWindowAttribute, &winRef) == kAXErrorSuccess && winRef) {
            AXUIElementPerformAction((AXUIElementRef)winRef, (CFStringRef)NSAccessibilityRaiseAction);
            CFRelease(winRef);
        }
        CFRelease(appRef);
    }

    NSString *bundleId = targetApp.bundleIdentifier;
    NSString *appName = targetApp.localizedName;
    NSString *scriptSrc = nil;
    if (bundleId && bundleId.length > 0) {
        scriptSrc = [NSString stringWithFormat:@"tell application id \"%@\" to activate", bundleId];
    } else if (appName && appName.length > 0) {
        scriptSrc = [NSString stringWithFormat:@"tell application \"%@\" to activate", appName];
    } else {
        scriptSrc = [NSString stringWithFormat:@"tell application \"System Events\" to set frontmost of (first process whose unix id is %d) to true", pid];
    }
    if (scriptSrc) {
        NSAppleScript *as = [[NSAppleScript alloc] initWithSource:scriptSrc];
        [as executeAndReturnError:nil];
    }

    if (@available(macOS 14.0, *)) {
        [targetApp activateWithOptions:NSApplicationActivateAllWindows];
    } else {
        [targetApp activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    }
}

void native_activate_app_at_point(double x, double y) {
    CGPoint pt = CGPointMake((CGFloat)x, (CGFloat)y);
    CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (!windowList) return;

    CFIndex count = CFArrayGetCount(windowList);
    pid_t myPid = getpid();
    pid_t targetPid = 0;

    for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
        if (!winInfo) continue;

        CFNumberRef pidNum = (CFNumberRef)CFDictionaryGetValue(winInfo, kCGWindowOwnerPID);
        CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(winInfo, kCGWindowBounds);
        if (!pidNum || !boundsDict) continue;

        pid_t pid = 0;
        CFNumberGetValue(pidNum, kCFNumberIntType, &pid);
        if (pid == myPid || pid <= 0) continue;

        CFNumberRef layerNum = (CFNumberRef)CFDictionaryGetValue(winInfo, kCGWindowLayer);
        int layer = 0;
        if (layerNum) CFNumberGetValue(layerNum, kCFNumberIntType, &layer);
        if (layer != 0) continue;

        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (!app || app.activationPolicy != NSApplicationActivationPolicyRegular) {
            continue;
        }

        CGRect rect;
        if (CGRectMakeWithDictionaryRepresentation(boundsDict, &rect)) {
            if (rect.size.width >= 50 && rect.size.height >= 50 && CGRectContainsPoint(rect, pt)) {
                targetPid = pid;
                break;
            }
        }
    }
    CFRelease(windowList);

    if (targetPid > 0) {
        NSRunningApplication *targetApp = [NSRunningApplication runningApplicationWithProcessIdentifier:targetPid];
        if (targetApp) {
            pid_t frontPid = [NSWorkspace sharedWorkspace].frontmostApplication.processIdentifier;
            if (frontPid != targetPid && !targetApp.active) {
                activate_app_robust(targetApp);
            }
        }
    }
}

static NSDictionary *dict_for_window_info(CFDictionaryRef winInfo, pid_t myPid) {
    if (!winInfo) return nil;

    CFNumberRef pidNum = (CFNumberRef)CFDictionaryGetValue(winInfo, kCGWindowOwnerPID);
    if (!pidNum) return nil;
    pid_t pid = 0;
    CFNumberGetValue(pidNum, kCFNumberIntType, &pid);
    if (pid == myPid || pid <= 0) return nil;

    CFNumberRef layerNum = (CFNumberRef)CFDictionaryGetValue(winInfo, kCGWindowLayer);
    int layer = 0;
    if (layerNum) CFNumberGetValue(layerNum, kCFNumberIntType, &layer);
    if (layer != 0) return nil;

    CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(winInfo, kCGWindowBounds);
    CGRect rect = CGRectZero;
    if (!boundsDict || !CGRectMakeWithDictionaryRepresentation(boundsDict, &rect)) return nil;
    if (rect.size.width < 50 || rect.size.height < 50) return nil;

    NSString *ownerName = (__bridge NSString *)CFDictionaryGetValue(winInfo, kCGWindowOwnerName);
    NSString *winTitle = (__bridge NSString *)CFDictionaryGetValue(winInfo, kCGWindowName);

    NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (app && app.activationPolicy != NSApplicationActivationPolicyRegular) return nil;

    NSString *appName = app.localizedName ?: (ownerName ?: @"未知应用");
    NSString *bundleId = app.bundleIdentifier ?: @"";
    NSString *title = winTitle ?: @"";

    return @{
        @"pid": @(pid),
        @"appName": appName,
        @"bundleId": bundleId,
        @"windowTitle": title,
        @"x": @((int)rect.origin.x),
        @"y": @((int)rect.origin.y),
        @"width": @((int)rect.size.width),
        @"height": @((int)rect.size.height)
    };
}

char *native_get_running_apps_json(void) {
    @autoreleasepool {
        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
        if (!windowList) return strdup("[]");

        pid_t myPid = getpid();
        CFIndex count = CFArrayGetCount(windowList);
        NSMutableArray *list = [NSMutableArray array];
        NSMutableSet *seenPids = [NSMutableSet set];

        for (CFIndex i = 0; i < count; i++) {
            CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
            NSDictionary *item = dict_for_window_info(winInfo, myPid);
            if (item) {
                NSNumber *p = item[@"pid"];
                if (![seenPids containsObject:p]) {
                    [seenPids addObject:p];
                    [list addObject:item];
                }
            }
        }
        CFRelease(windowList);

        NSData *data = [NSJSONSerialization dataWithJSONObject:list options:0 error:nil];
        if (!data) return strdup("[]");
        NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup([jsonStr UTF8String]);
    }
}

char *native_get_frontmost_app_json(void) {
    @autoreleasepool {
        pid_t myPid = getpid();
        NSRunningApplication *frontApp = [NSWorkspace sharedWorkspace].frontmostApplication;
        pid_t targetPid = 0;
        if (frontApp && frontApp.processIdentifier != myPid && frontApp.activationPolicy == NSApplicationActivationPolicyRegular) {
            targetPid = frontApp.processIdentifier;
        }

        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
        if (!windowList) return strdup("{}");

        CFIndex count = CFArrayGetCount(windowList);
        NSDictionary *matchedDict = nil;

        if (targetPid > 0) {
            for (CFIndex i = 0; i < count; i++) {
                CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
                NSDictionary *item = dict_for_window_info(winInfo, myPid);
                if (item && [item[@"pid"] intValue] == targetPid) {
                    matchedDict = item;
                    break;
                }
            }
        }

        if (!matchedDict) {
            for (CFIndex i = 0; i < count; i++) {
                CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
                NSDictionary *item = dict_for_window_info(winInfo, myPid);
                if (item) {
                    matchedDict = item;
                    break;
                }
            }
        }
        CFRelease(windowList);

        if (!matchedDict) return strdup("{}");
        NSData *data = [NSJSONSerialization dataWithJSONObject:matchedDict options:0 error:nil];
        if (!data) return strdup("{}");
        NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup([jsonStr UTF8String]);
    }
}

char *native_get_app_at_point_json(double x, double y) {
    @autoreleasepool {
        pid_t myPid = getpid();
        CGPoint pt = CGPointMake((CGFloat)x, (CGFloat)y);
        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
        if (!windowList) return strdup("{}");

        CFIndex count = CFArrayGetCount(windowList);
        NSDictionary *matchedDict = nil;

        for (CFIndex i = 0; i < count; i++) {
            CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
            NSDictionary *item = dict_for_window_info(winInfo, myPid);
            if (item) {
                int wx = [item[@"x"] intValue];
                int wy = [item[@"y"] intValue];
                int ww = [item[@"width"] intValue];
                int wh = [item[@"height"] intValue];
                CGRect r = CGRectMake(wx, wy, ww, wh);
                if (CGRectContainsPoint(r, pt)) {
                    matchedDict = item;
                    break;
                }
            }
        }
        CFRelease(windowList);

        if (!matchedDict) return strdup("{}");
        NSData *data = [NSJSONSerialization dataWithJSONObject:matchedDict options:0 error:nil];
        if (!data) return strdup("{}");
        NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup([jsonStr UTF8String]);
    }
}

static NSDictionary *get_actual_window_bounds_for_pid(int targetPid) {
    if (targetPid <= 0) return nil;
    pid_t myPid = getpid();
    CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (!windowList) return nil;

    CFIndex count = CFArrayGetCount(windowList);
    NSDictionary *matched = nil;
    for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef winInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
        NSDictionary *dict = dict_for_window_info(winInfo, myPid);
        if (dict && [dict[@"pid"] intValue] == targetPid) {
            int w = [dict[@"width"] intValue];
            int h = [dict[@"height"] intValue];
            if (w > 50 && h > 50) {
                matched = dict;
                break;
            }
        }
    }
    CFRelease(windowList);
    return matched;
}

static BOOL set_window_bounds_via_ax(int pid, double x, double y, double width, double height, int move_pos, int resize_size) {
    AXUIElementRef appRef = AXUIElementCreateApplication(pid);
    if (!appRef) return NO;

    CFTypeRef winRef = NULL;
    AXError err = AXUIElementCopyAttributeValue(appRef, kAXMainWindowAttribute, &winRef);
    if (err != kAXErrorSuccess || !winRef) {
        err = AXUIElementCopyAttributeValue(appRef, kAXFocusedWindowAttribute, &winRef);
    }
    if (err != kAXErrorSuccess || !winRef) {
        CFArrayRef windows = NULL;
        err = AXUIElementCopyAttributeValues(appRef, kAXWindowsAttribute, 0, 100, &windows);
        if (err == kAXErrorSuccess && windows) {
            CFIndex count = CFArrayGetCount(windows);
            for (CFIndex i = 0; i < count; i++) {
                AXUIElementRef w = (AXUIElementRef)CFArrayGetValueAtIndex(windows, i);
                CFTypeRef role = NULL;
                if (AXUIElementCopyAttributeValue(w, kAXRoleAttribute, &role) == kAXErrorSuccess && role) {
                    if ([(__bridge NSString *)role isEqualToString:(__bridge NSString *)kAXWindowRole]) {
                        winRef = CFRetain(w);
                        CFRelease(role);
                        break;
                    }
                    CFRelease(role);
                }
            }
            CFRelease(windows);
        }
    }

    if (!winRef) {
        CFRelease(appRef);
        return NO;
    }

    AXUIElementRef targetWin = (AXUIElementRef)winRef;
    AXUIElementSetAttributeValue(appRef, kAXFrontmostAttribute, kCFBooleanTrue);
    AXUIElementSetAttributeValue(targetWin, kAXMainAttribute, kCFBooleanTrue);
    AXUIElementPerformAction(targetWin, kAXRaiseAction);

    BOOL modified = NO;
    if (resize_size && width > 10 && height > 10) {
        CGSize sz = CGSizeMake((CGFloat)width, (CGFloat)height);
        AXValueRef sizeVal = AXValueCreate(kAXValueCGSizeType, &sz);
        if (sizeVal) {
            if (AXUIElementSetAttributeValue(targetWin, kAXSizeAttribute, sizeVal) == kAXErrorSuccess) modified = YES;
            CFRelease(sizeVal);
        }
    }

    if (move_pos && x >= 0 && y >= 0) {
        CGPoint pt = CGPointMake((CGFloat)x, (CGFloat)y);
        AXValueRef posVal = AXValueCreate(kAXValueCGPointType, &pt);
        if (posVal) {
            if (AXUIElementSetAttributeValue(targetWin, kAXPositionAttribute, posVal) == kAXErrorSuccess) modified = YES;
            CFRelease(posVal);
        }
    }

    if (resize_size && width > 10 && height > 10) {
        CGSize sz = CGSizeMake((CGFloat)width, (CGFloat)height);
        AXValueRef sizeVal = AXValueCreate(kAXValueCGSizeType, &sz);
        if (sizeVal) {
            AXUIElementSetAttributeValue(targetWin, kAXSizeAttribute, sizeVal);
            CFRelease(sizeVal);
        }
    }

    CFRelease(targetWin);
    CFRelease(appRef);
    return modified;
}

static void run_apple_script_window_bounds(int pid, const char *appName, int move_pos, int resize_size, int x, int y, int w, int h) {
    NSMutableString *script = [NSMutableString string];
    [script appendString:@"tell application \"System Events\"\n"];
    if (pid > 0) {
        [script appendFormat:@"set pList to (every process whose unix id is %d)\n", pid];
        [script appendString:@"if (count of pList) > 0 then\n"];
        [script appendString:@"set targetProc to item 1 of pList\n"];
        [script appendString:@"tell targetProc\n"];
        [script appendString:@"if (count of windows) > 0 then\n"];
        if (resize_size && w > 10 && h > 10) [script appendFormat:@"try\nset size of window 1 to {%d, %d}\nend try\n", w, h];
        if (move_pos && x >= 0 && y >= 0) [script appendFormat:@"try\nset position of window 1 to {%d, %d}\nend try\n", x, y];
        [script appendString:@"end if\nend tell\nend if\n"];
    } else if (appName && strlen(appName) > 0) {
        NSString *name = [NSString stringWithUTF8String:appName];
        [script appendFormat:@"tell process \"%@\"\n", name];
        [script appendString:@"if (count of windows) > 0 then\n"];
        if (resize_size && w > 10 && h > 10) [script appendFormat:@"try\nset size of window 1 to {%d, %d}\nend try\n", w, h];
        if (move_pos && x >= 0 && y >= 0) [script appendFormat:@"try\nset position of window 1 to {%d, %d}\nend try\n", x, y];
        [script appendString:@"end if\nend tell\n"];
    }
    [script appendString:@"end tell"];

    NSDictionary *errDict = nil;
    NSAppleScript *appleScript = [[NSAppleScript alloc] initWithSource:script];
    [appleScript executeAndReturnError:&errDict];
}

char *native_set_app_window_bounds_json(int pid, const char *bundle_id_c, const char *app_name_c, double x, double y, double width, double height, int move_pos, int resize_size) {
    @autoreleasepool {
        pid_t myPid = getpid();
        NSRunningApplication *app = nil;
        if (pid > 0) app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];

        if (!app && bundle_id_c && strlen(bundle_id_c) > 0) {
            NSString *bId = [NSString stringWithUTF8String:bundle_id_c];
            NSArray<NSRunningApplication *> *apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:bId];
            if (apps.count > 0) {
                app = apps.firstObject;
                pid = app.processIdentifier;
            }
        }

        if (!app && app_name_c && strlen(app_name_c) > 0) {
            NSString *targetName = [NSString stringWithUTF8String:app_name_c];
            NSArray<NSRunningApplication *> *apps = [NSWorkspace sharedWorkspace].runningApplications;
            for (NSRunningApplication *item in apps) {
                if (item.processIdentifier == myPid) continue;
                if ([item.localizedName isEqualToString:targetName] ||
                    [item.bundleIdentifier isEqualToString:targetName] ||
                    [item.localizedName containsString:targetName] ||
                    [targetName containsString:item.localizedName]) {
                    app = item;
                    pid = item.processIdentifier;
                    break;
                }
            }
        }

        if (pid <= 0) return strdup("{\"success\":false,\"message\":\"Target application not found\"}");
        if (app) activate_app_robust(app);

        set_window_bounds_via_ax(pid, x, y, width, height, move_pos, resize_size);
        run_apple_script_window_bounds(pid, app_name_c, move_pos, resize_size, (int)x, (int)y, (int)width, (int)height);
        usleep(120000);

        NSDictionary *actualDict = get_actual_window_bounds_for_pid(pid);
        NSMutableDictionary *res = [NSMutableDictionary dictionary];
        res[@"success"] = @YES;
        res[@"x"] = actualDict ? actualDict[@"x"] : @((int)x);
        res[@"y"] = actualDict ? actualDict[@"y"] : @((int)y);
        res[@"width"] = actualDict ? actualDict[@"width"] : @((int)width);
        res[@"height"] = actualDict ? actualDict[@"height"] : @((int)height);
        res[@"pid"] = @(pid);
        if (actualDict && actualDict[@"appName"]) res[@"appName"] = actualDict[@"appName"];

        NSData *data = [NSJSONSerialization dataWithJSONObject:res options:0 error:nil];
        if (!data) return strdup("{}");
        NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup([jsonStr UTF8String]);
    }
}

int native_set_app_window_bounds(int pid, double x, double y, double width, double height, int move_pos, int resize_size) {
    char *res = native_set_app_window_bounds_json(pid, NULL, NULL, x, y, width, height, move_pos, resize_size);
    if (res) {
        free(res);
        return 1;
    }
    return 0;
}

int native_activate_app_by_pid_or_bundle(int pid, const char *bundle_id_c, const char *app_name_c) {
    @autoreleasepool {
        NSRunningApplication *targetApp = nil;
        if (pid > 0) targetApp = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (!targetApp && bundle_id_c && strlen(bundle_id_c) > 0) {
            NSString *bId = [NSString stringWithUTF8String:bundle_id_c];
            NSArray *apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:bId];
            if (apps.count > 0) targetApp = apps.firstObject;
        }
        if (!targetApp && app_name_c && strlen(app_name_c) > 0) {
            NSString *name = [NSString stringWithUTF8String:app_name_c];
            NSArray *all = [[NSWorkspace sharedWorkspace] runningApplications];
            for (NSRunningApplication *a in all) {
                if ([a.localizedName isEqualToString:name]) {
                    targetApp = a;
                    break;
                }
            }
        }
        if (targetApp) {
            activate_app_robust(targetApp);
            return 1;
        }
        return 0;
    }
}
