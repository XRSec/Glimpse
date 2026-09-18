import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv, maskStore, getUsableScreenBounds } from './maskStore';
import type { TargetAppConfig } from '../types/script';

export interface WindowBoundsResult {
  success: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  app_name?: string;
  appName?: string;
  pid?: number;
}

// 外部日志与状态回调钩子
let loggerFn: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void = () => {};
let getEditingScriptFn: () => any = () => null;

export const setAppTargetHooks = (
  logFn: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void,
  getScriptFn: () => any
) => {
  loggerFn = logFn;
  getEditingScriptFn = getScriptFn;
};

// 获取系统运行中前台应用列表
export const fetchRunningApps = async (): Promise<any[]> => {
  if (!isTauriEnv()) {
    return [
      { pid: 101, appName: 'Safari 浏览器', bundleId: 'com.apple.Safari', windowTitle: 'Apple 官方网站', x: 100, y: 100, width: 1280, height: 800 },
      { pid: 102, appName: '微信', bundleId: 'com.tencent.xinWeChat', windowTitle: '微信', x: 200, y: 150, width: 960, height: 640 },
      { pid: 103, appName: '访达 (Finder)', bundleId: 'com.apple.finder', windowTitle: '访达', x: 300, y: 200, width: 920, height: 480 }
    ];
  }
  try {
    const res: any = await invoke('get_running_apps');
    return Array.isArray(res) ? res : [];
  } catch (e) {
    console.warn('fetchRunningApps failed:', e);
    return [];
  }
};

// 感知当前置顶前台应用
export const detectFrontmostApp = async (): Promise<any | null> => {
  if (!isTauriEnv()) {
    return { pid: 101, appName: 'Safari 浏览器', bundleId: 'com.apple.Safari', windowTitle: 'Apple 官方网站', x: 100, y: 100, width: 1280, height: 800 };
  }
  try {
    const res: any = await invoke('get_frontmost_app');
    if (res && res.appName) return res;
    return null;
  } catch (e) {
    console.warn('detectFrontmostApp failed:', e);
    return null;
  }
};

// 检测指定屏幕坐标点下的应用
export const detectAppAtPoint = async (x: number, y: number): Promise<any | null> => {
  if (!isTauriEnv()) return null;
  try {
    const res: any = await invoke('get_app_at_point', { x, y });
    if (res && res.appName) return res;
    return null;
  } catch (e) {
    return null;
  }
};

// 绑定目标应用到当前编辑脚本
export const bindTargetAppToCurrentScript = (appInfo: any) => {
  const editingScript = getEditingScriptFn();
  if (!editingScript) return;
  const initialBounds = {
    x: Math.round(appInfo.x || 0),
    y: Math.round(appInfo.y || 0),
    width: Math.round(appInfo.width || 800),
    height: Math.round(appInfo.height || 600)
  };
  editingScript.targetApp = {
    appName: appInfo.appName,
    bundleId: appInfo.bundleId,
    windowTitle: appInfo.windowTitle,
    pid: appInfo.pid,
    initialBounds,
    autoResizeOnRun: true,
    autoFocusOnRun: true,
    autoMoveOnRun: false
  };
  loggerFn('success', `🎯 已自动定位并绑定目标应用「${appInfo.appName}」，记录尺寸: ${initialBounds.width} × ${initialBounds.height} (坐标: ${initialBounds.x}, ${initialBounds.y})`);
};

// 动态调整应用窗口大小与位置
export const applyAppWindowBounds = async (
  pid: number | undefined,
  bounds: { x?: number; y?: number; width: number; height: number },
  appName?: string,
  bundleId?: string,
  movePos: boolean = true
): Promise<WindowBoundsResult | null> => {
  if (!isTauriEnv()) {
    return {
      success: true,
      x: bounds.x ?? 100,
      y: bounds.y ?? 100,
      width: bounds.width,
      height: bounds.height
    };
  }
  try {
    const res: any = await invoke('set_app_window_bounds', {
      pid: pid ?? 0,
      bundle_id: bundleId || null,
      bundleId: bundleId || null,
      app_name: appName || null,
      appName: appName || null,
      x: movePos ? bounds.x : null,
      y: movePos ? bounds.y : null,
      width: bounds.width,
      height: bounds.height
    });
    return res;
  } catch (e) {
    console.warn('applyAppWindowBounds failed:', e);
    return null;
  }
};

// 唤醒置顶目标应用
export const activateTargetApp = async (targetApp: TargetAppConfig): Promise<boolean> => {
  if (!isTauriEnv()) return true;
  try {
    const ok: boolean = await invoke('activate_target_app', {
      pid: targetApp.pid || null,
      bundle_id: targetApp.bundleId || null,
      app_name: targetApp.appName || null
    });
    return ok;
  } catch (e) {
    return false;
  }
};

// 蒙版左上角对齐到应用位置（蒙版自身尺寸不变）
export const alignMaskTopLeftToApp = async (appX: number, appY: number) => {
  await maskStore.alignToApp(appX, appY);
  loggerFn('success', `🪟 蒙版左上角已对齐目标应用 (${maskStore.bounds.x}, ${maskStore.bounds.y})，蒙版尺寸保持不变`);
};

// 贴合蒙版到指定矩形
export const snapMaskToBounds = async (x: number, y: number, width: number, height: number) => {
  await maskStore.snapToBounds({ x, y, width, height });
};

// 贴合蒙版到目标应用 (动态探测最新物理位置)
export const snapMaskToApp = async (targetApp: TargetAppConfig | any) => {
  const b = targetApp.initialBounds || targetApp;
  if (!b || typeof b.width !== 'number') return;
  let x = Math.round(b.x !== undefined ? b.x : maskStore.bounds.x);
  let y = Math.round(b.y !== undefined ? b.y : maskStore.bounds.y);
  let width = Math.round(b.width);
  let height = Math.round(b.height);

  if (isTauriEnv() && (targetApp.appName || targetApp.bundleId)) {
    try {
      const runningList: any = await invoke('get_running_apps');
      if (Array.isArray(runningList)) {
        const matched = runningList.find(
          (a: any) =>
            (targetApp.bundleId && a.bundleId === targetApp.bundleId) ||
            (targetApp.appName && a.appName === targetApp.appName) ||
            (targetApp.appName && a.appName?.includes(targetApp.appName))
        );
        if (matched && typeof matched.x === 'number' && typeof matched.y === 'number') {
          x = Math.round(matched.x);
          y = Math.round(matched.y);
          if (matched.width > 50 && matched.height > 50) {
            width = Math.round(matched.width);
            height = Math.round(matched.height);
          }
        }
      }
    } catch (e) {}
  }

  const isAlreadyAligned =
    Math.abs(maskStore.bounds.x - x) < 2 &&
    Math.abs(maskStore.bounds.y - y) < 2 &&
    Math.abs(maskStore.bounds.width - width) < 2 &&
    Math.abs(maskStore.bounds.height - height) < 2;

  if (!isAlreadyAligned) {
    await maskStore.snapToBounds({ x, y, width, height });
  }

  const editingScript = getEditingScriptFn();
  if (editingScript?.targetApp) {
    if (!editingScript.targetApp.initialBounds) {
      editingScript.targetApp.initialBounds = { x, y, width, height };
    } else {
      editingScript.targetApp.initialBounds.x = x;
      editingScript.targetApp.initialBounds.y = y;
      editingScript.targetApp.initialBounds.width = width;
      editingScript.targetApp.initialBounds.height = height;
    }
  }
  loggerFn('success', `🪟 悬浮蒙版已贴合对齐目标应用「${targetApp.appName || ''}」(${width} × ${height}) 坐标: (${x}, ${y})`);
};

// 设置自定义部分区域为基准
export const setCustomTargetRegion = (bounds: { x: number; y: number; width: number; height: number }) => {
  const editingScript = getEditingScriptFn();
  if (!editingScript) return;
  editingScript.targetApp = {
    appName: '自定义部分区域',
    bundleId: 'com.apple.custom-region',
    windowTitle: `部分区域 (${bounds.width}×${bounds.height})`,
    initialBounds: bounds,
    autoResizeOnRun: false,
    autoFocusOnRun: false,
    autoMoveOnRun: false
  };
  maskStore.snapToBounds(bounds);
  loggerFn('success', `📐 已设置部分区域定位基准: ${bounds.width}×${bounds.height} (坐标: ${bounds.x}, ${bounds.y})`);
};

// 设置工作区全屏定位基准
export const setMaskFullscreen = async (fullscreen: boolean) => {
  await maskStore.setFullscreen(fullscreen);
};

// 一键将当前脚本切换为工作区全屏定位基准
export const setFullscreenTargetRegion = async () => {
  const bounds = getUsableScreenBounds();
  const editingScript = getEditingScriptFn();
  if (editingScript) {
    editingScript.targetApp = {
      appName: '全屏幕基准',
      bundleId: 'com.apple.fullscreen',
      windowTitle: `全屏幕 (${bounds.width}×${bounds.height})`,
      initialBounds: bounds,
      autoResizeOnRun: false,
      autoFocusOnRun: false,
      autoMoveOnRun: false
    };
  }
  await maskStore.setVisible(true);
  await maskStore.setFullscreen(true);
  loggerFn('success', `🖥️ 已切换为工作区全屏定位基准 (${bounds.width} × ${bounds.height})，蒙版已铺满工作区`);
};
