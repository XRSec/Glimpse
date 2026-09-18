import { ref, reactive, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { emit as tauriEmit, listen as tauriListen } from '@tauri-apps/api/event';
import type {
  MaskInteractionMode,
  MaskInteractionContext,
  BaseStepMarker,
  ScriptAction,
  LabeledBounds,
  HitAnchor
} from '../types/script';

// 基础常量
const STORAGE_BOUNDS_KEY = 'glimpse_mask_bounds';

export const isTauriEnv = (): boolean =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

// 获取系统安全屏幕尺寸 (排除顶部菜单栏/通知栏)
export const getUsableScreenBounds = () => {
  if (typeof window === 'undefined') {
    return { x: 0, y: 25, width: 1440, height: 875 };
  }
  const sw = window.screen.width || 1440;
  const sh = window.screen.height || 900;
  const screenAny = window.screen as any;
  const menuBarHeight = Math.max(25, screenAny.availTop || 25);
  const usableHeight = window.screen.availHeight
    ? Math.min(window.screen.availHeight, sh - menuBarHeight)
    : sh - menuBarHeight;
  const usableWidth = window.screen.availWidth || sw;
  const usableLeft = screenAny.availLeft || 0;

  return {
    x: usableLeft,
    y: menuBarHeight,
    width: usableWidth,
    height: usableHeight
  };
};

// =========================================================================
// 1. 蒙版核心响应式状态 (Reactive State)
// =========================================================================

// 蒙版物理位置与尺寸 (屏幕绝对物理逻辑点)
export const bounds = reactive({
  x: 100,
  y: 100,
  width: 760,
  height: 520
});

// 显隐与窗口模式
export const visible = ref(false);
export const isMinimized = ref(false);
export const isFullscreen = ref(false);

// 交互模式与上下文
export const mode = ref<MaskInteractionMode>('none');
export const context = ref<MaskInteractionContext>({ mode: 'none' });

// 运行时/测试命中绿框锚点 (绝对屏幕坐标)
export const runHitAnchor = ref<HitAnchor | null>(null);

// OCR/截屏瞬间闪避状态 (临时透明蒙版所有内部图形以保证 100% 纯净截图)
export const isOverlayDodged = ref(false);

// 限制搜索区域矩形 (蓝色虚线框，绝对屏幕坐标)
export const searchROI = ref<LabeledBounds | null>(null);

// 基准步骤/条件限制区域矩形 (紫/青色虚线框，常驻屏幕，用于前序步骤限定范围)
export const baseROI = ref<LabeledBounds | null>(null);

// 步骤基准命中内存热缓存 (stepIndex -> BaseStepMarker，纯内存管理，不持久化污染脚本)
export const lastBaseMarkerMap = ref<Record<number, BaseStepMarker>>({});

// =========================================================================
// 2. 跨窗口通信广播中心 (BroadcastChannel + Tauri Events + LocalStorage)
// =========================================================================

export const handleMaskSyncMessage = (msg: any) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'bounds_updated':
      if (msg.bounds) {
        bounds.x = msg.bounds.x;
        bounds.y = msg.bounds.y;
        bounds.width = msg.bounds.width;
        bounds.height = msg.bounds.height;
      }
      break;
    case 'visibility_updated':
      visible.value = !!msg.show;
      if (msg.isMinimized !== undefined) isMinimized.value = msg.isMinimized;
      if (msg.isFullscreen !== undefined) isFullscreen.value = msg.isFullscreen;
      break;
    case 'mask_interaction_start':
      mode.value = msg.context?.mode || 'none';
      context.value = msg.context || { mode: 'none' };
      break;
    case 'mask_interaction_cancel':
      mode.value = 'none';
      context.value = { mode: 'none' };
      break;
    case 'run_hit_anchor_updated':
      runHitAnchor.value = msg.anchor ?? null;
      break;
    case 'search_roi_updated':
      searchROI.value = msg.roi ?? null;
      break;
    case 'base_roi_updated':
      baseROI.value = msg.roi ?? null;
      break;
    case 'overlay_dodge_updated':
      isOverlayDodged.value = !!msg.dodged;
      break;
    case 'base_marker_updated':
      if (msg.stepIndex !== undefined) {
        if (msg.marker) lastBaseMarkerMap.value[msg.stepIndex] = msg.marker;
        else delete lastBaseMarkerMap.value[msg.stepIndex];
      }
      break;
  }
};

let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('glimpse_window_sync_channel');
    syncChannel.onmessage = (event) => {
      handleMaskSyncMessage(event.data);
    };
  } catch (e) {
    console.warn('maskStore BroadcastChannel 初始化失败:', e);
  }
}

// 原生多窗口通信：全局注入监听（跨 WKWebView 必备，直通 Rust eval 与 Tauri Event）
if (typeof window !== 'undefined') {
  (window as any).__glimpse_on_mask_sync = (payload: any) => {
    handleMaskSyncMessage(payload);
  };

  try {
    tauriListen('glimpse_mask_sync_event', (event: any) => {
      handleMaskSyncMessage(event.payload);
    }).catch(() => {});
  } catch (e) {}

  window.addEventListener('storage', (e) => {
    if (e.key === 'glimpse_mask_sync_state' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.msg) handleMaskSyncMessage(parsed.msg);
      } catch (err) {}
    }
  });
}

export const pullLatestSyncFromNative = async () => {
  if (!isTauriEnv()) return;
  try {
    const state: any = await invoke('get_latest_mask_sync');
    if (state) handleMaskSyncMessage(state);
  } catch (e) {}
};

export const broadcastMaskSync = (type: string, data: Record<string, any> = {}) => {
  const payload = JSON.parse(JSON.stringify({ type, ...data }));
  if (syncChannel) {
    try {
      syncChannel.postMessage(payload);
    } catch (e) {}
  }
  try {
    tauriEmit('glimpse_mask_sync_event', payload).catch(() => {});
  } catch (e) {}
  try {
    localStorage.setItem('glimpse_mask_sync_state', JSON.stringify({ msg: payload, t: Date.now() }));
  } catch (e) {}
  if (isTauriEnv()) {
    try {
      invoke('broadcast_mask_sync', { payload }).catch(() => {});
    } catch (e) {}
  }
};

// =========================================================================
// 3. 位置与尺寸管理 API (Position & Size)
// =========================================================================

export const loadBoundsFromStorage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_BOUNDS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.width > 50 && parsed.height > 50) {
        bounds.x = parsed.x ?? bounds.x;
        bounds.y = parsed.y ?? bounds.y;
        bounds.width = parsed.width ?? bounds.width;
        bounds.height = parsed.height ?? bounds.height;
      }
    }
  } catch (e) {}
};

export const saveBoundsToStorage = () => {
  try {
    localStorage.setItem(STORAGE_BOUNDS_KEY, JSON.stringify(bounds));
  } catch (e) {}
};

// 初始化载入
loadBoundsFromStorage();

// 同步原生窗口实际位置与尺寸
export const syncFromNative = async (): Promise<boolean> => {
  if (!isTauriEnv()) return false;
  try {
    const rawBounds: any = await invoke('get_mask_screen_bounds');
    if (rawBounds && typeof rawBounds.x === 'number' && typeof rawBounds.y === 'number') {
      bounds.x = Math.round(rawBounds.x);
      bounds.y = Math.round(rawBounds.y);
      bounds.width = Math.round(rawBounds.width);
      bounds.height = Math.round(rawBounds.height);
      if (typeof rawBounds.visible === 'boolean') {
        visible.value = rawBounds.visible;
      }
      saveBoundsToStorage();
      broadcastMaskSync('bounds_updated', { bounds: { ...bounds } });
      return true;
    }
  } catch (e) {}
  return false;
};

// 强力吸附至目标矩形区域
export const snapToBounds = async (b: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  bounds.x = Math.round(b.x);
  bounds.y = Math.round(b.y);
  bounds.width = Math.round(b.width);
  bounds.height = Math.round(b.height);
  saveBoundsToStorage();
  broadcastMaskSync('bounds_updated', { bounds: { ...bounds } });

  if (isTauriEnv()) {
    try {
      await invoke('snap_mask_to_bounds', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    } catch (e) {
      console.warn('snapToBounds invoke 失败:', e);
    }
  }
};

// 对齐到应用窗口左上角 (尺寸保持用户配置或原有尺寸)
export const alignToApp = async (appX: number, appY: number) => {
  bounds.x = Math.round(appX);
  bounds.y = Math.round(appY);
  saveBoundsToStorage();
  broadcastMaskSync('bounds_updated', { bounds: { ...bounds } });

  if (isTauriEnv()) {
    try {
      await invoke('snap_mask_to_bounds', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    } catch (e) {
      console.warn('alignToApp invoke 失败:', e);
    }
  }
};

// 设置全屏工作区基准
export const setFullscreen = async (fullscreen: boolean) => {
  isFullscreen.value = fullscreen;
  const usable = getUsableScreenBounds();
  if (fullscreen) {
    await snapToBounds(usable);
  }
};

// =========================================================================
// 4. 显隐与穿透控制 API (Visibility & Passthrough)
// =========================================================================

export const setVisible = async (show: boolean) => {
  visible.value = show;
  if (show) {
    isMinimized.value = false;
  } else {
    // 隐藏时彻底清理全部交互残留与临时标记
    mode.value = 'none';
    context.value = { mode: 'none' };
    runHitAnchor.value = null;
    searchROI.value = null;
    baseROI.value = null;
    broadcastMaskSync('mask_interaction_cancel');
    broadcastMaskSync('run_hit_anchor_updated', { anchor: null });
    broadcastMaskSync('search_roi_updated', { roi: null });
    broadcastMaskSync('base_roi_updated', { roi: null });
  }

  broadcastMaskSync('visibility_updated', {
    show,
    isMinimized: isMinimized.value,
    isFullscreen: isFullscreen.value
  });

  if (isTauriEnv()) {
    try {
      await invoke('show_mask_overlay', { show });
    } catch (e) {
      console.warn('show_mask_overlay 失败:', e);
    }
  }
};

// 联动设置 Rust 原生窗口穿透 (selecting: true = 阻断点击接收拖拽; false = 全局穿透)
export const setSelectingMode = async (selecting: boolean) => {
  if (isTauriEnv()) {
    try {
      await invoke('set_mask_selecting_mode', { selecting });
    } catch (e) {}
  }
};

// 动作执行前临时隐藏蒙版 (彻底防范蒙版边框/准星污染截图)，返回后可用于恢复
export const hideTemporarilyForAction = async (): Promise<boolean> => {
  const wasVisible = visible.value;
  if (wasVisible && isTauriEnv()) {
    await invoke('show_mask_overlay', { show: false }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return wasVisible;
};

// 动作执行后恢复蒙版显隐
export const restoreVisibility = async (shouldShow: boolean) => {
  if (shouldShow && isTauriEnv()) {
    await invoke('show_mask_overlay', { show: true }).catch(() => {});
  }
};

// =========================================================================
// 5. 交互选区模式 API (Selection Interaction)
// =========================================================================

// 开启限制区域选区模式 (橙色框)
export const startLimitSelection = async (options: {
  actionId: string;
  actionName?: string;
  targetStepIndex?: number;
  initialLimit?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}): Promise<boolean> => {
  await syncFromNative();

  const wasHidden = !visible.value;
  await setVisible(true);
  if (wasHidden) {
    await new Promise((r) => setTimeout(r, 150));
  }

  const baseMarker =
    options.targetStepIndex !== undefined
      ? lastBaseMarkerMap.value[options.targetStepIndex]
      : undefined;

  const ctx: MaskInteractionContext = {
    mode: 'selecting_limit',
    actionId: options.actionId,
    actionName: options.actionName,
    targetField: 'limit',
    offsetStep: options.targetStepIndex,
    initialLimit: options.initialLimit || { left: 0, right: 200, top: 0, bottom: 300 },
    baseMarker,
    promptText: options.targetStepIndex !== undefined
      ? `正在基于步骤 #${options.targetStepIndex + 1} 设定限制区域，拖拽调整橙色框，点击「确定」完成`
      : '正在设定限制区域，拖拽调整橙色框，点击「确定」完成'
  };

  mode.value = 'selecting_limit';
  context.value = ctx;
  broadcastMaskSync('mask_interaction_start', { context: ctx });

  // 关键：立即切换原生窗口交互穿透模式为阻断，确保能接收鼠标拖拽选区
  await setSelectingMode(true);
  return true;
};

// 开启十字准星取点模式
export const startPointPicking = async (options: {
  actionId: string;
  targetField: string;
  actionName?: string;
}) => {
  await setVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'picking_point',
    actionId: options.actionId,
    targetField: options.targetField,
    actionName: options.actionName,
    promptText: '请在蒙版区域内点击目标位置（按 ESC 取消）'
  };
  mode.value = 'picking_point';
  context.value = ctx;
  broadcastMaskSync('mask_interaction_start', { context: ctx });
};

// 开启 ROI 矩形框选模式
export const startROISelection = async (options: {
  actionId: string;
  actionName?: string;
}) => {
  await setVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'selecting_roi',
    actionId: options.actionId,
    actionName: options.actionName,
    promptText: '请在蒙版内按住鼠标左键拉拽出识别矩形（按 ESC 取消）'
  };
  mode.value = 'selecting_roi';
  context.value = ctx;
  broadcastMaskSync('mask_interaction_start', { context: ctx });
};

// 开启相对偏移测算
export const startOffsetMeasurement = async (options: {
  actionId: string;
  actionName?: string;
  targetStepIndex?: number;
}) => {
  await setVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'measuring_offset',
    actionId: options.actionId,
    actionName: options.actionName,
    offsetStep: 1,
    promptText: '请点击基准位置，然后点击目标位置以测算相对偏移（按 ESC 取消）'
  };
  mode.value = 'measuring_offset';
  context.value = ctx;
  broadcastMaskSync('mask_interaction_start', { context: ctx });
};

// 取消当前交互模式
export const cancelInteraction = async () => {
  mode.value = 'none';
  context.value = { mode: 'none' };
  broadcastMaskSync('mask_interaction_cancel');
  await setSelectingMode(false);
};

// =========================================================================
// 6. 定位矩形与标记 API (Markers & Anchors)
// =========================================================================

// 设置基准步骤/条件限制区域矩形 (紫/青虚线框)
export const setBaseROI = (roi: LabeledBounds | null) => {
  baseROI.value = roi;
  broadcastMaskSync('base_roi_updated', { roi });
};

// 清除基准步骤限制区域矩形
export const clearBaseROI = () => {
  setBaseROI(null);
};

// 设置命中绿框
export const setRunHitAnchor = (anchor: HitAnchor | null) => {
  runHitAnchor.value = anchor;
  broadcastMaskSync('run_hit_anchor_updated', { anchor });
};

// 清除命中绿框
export const clearRunHitAnchor = () => {
  setRunHitAnchor(null);
};

// 设置蓝色搜索范围矩形
export const setSearchROI = (roi: LabeledBounds | null) => {
  searchROI.value = roi;
  broadcastMaskSync('search_roi_updated', { roi });
};

// 清除蓝色搜索范围矩形
export const clearSearchROI = () => {
  setSearchROI(null);
};

// 截屏闪避：瞬间透明蒙版所有内部图形（虚线框、锚点、Badge），保证 100% 纯净截图
export const setOverlayDodged = async (dodged: boolean) => {
  isOverlayDodged.value = dodged;
  broadcastMaskSync('overlay_dodge_updated', { dodged });
  if (dodged) {
    await new Promise((r) => setTimeout(r, 30));
  }
};

// 写入/获取内存热缓存
export const setBaseMarker = (stepIndex: number, marker: BaseStepMarker) => {
  lastBaseMarkerMap.value[stepIndex] = marker;
  broadcastMaskSync('base_marker_updated', { stepIndex, marker });
};

export const getBaseMarker = (stepIndex: number): BaseStepMarker | undefined => {
  return lastBaseMarkerMap.value[stepIndex];
};

export const clearBaseMarkers = () => {
  lastBaseMarkerMap.value = {};
  broadcastMaskSync('base_marker_updated', { stepIndex: undefined, marker: null });
};

// =========================================================================
// 7. 限制区域计算与坐标工具 API (ROI & Coordinate Calculation)
// =========================================================================

// 计算动作在屏幕上的实际有效检索区域 (ROI)
export const calculateEffectiveROI = (
  action: ScriptAction,
  stepIndex: number,
  executedStepCoordinates: Record<number, { x: number; y: number }>
): { x: number; y: number; width: number; height: number; label?: string } => {
  const scope = action.regionScope;
  const maskX = Math.round(bounds.x);
  const maskY = Math.round(bounds.y);
  const maskW = Math.round(bounds.width);
  const maskH = Math.round(bounds.height);

  const legacyType = (scope as any)?.type as string | undefined;
  const bt = scope?.baseType
    || (legacyType === 'limit' || legacyType === 'custom' ? 'mask' : undefined)
    || (legacyType === 'relative_step' || legacyType === 'step' ? 'step' : undefined);

  // 1. 基于前序步骤的基准点进行相对限制 (step-based)
  if (bt === 'step') {
    const baseIndex = scope!.targetStepIndex ?? (stepIndex - 1);
    const baseCoord = executedStepCoordinates[baseIndex] || lastBaseMarkerMap.value[baseIndex];

    if (baseCoord) {
      const left = scope!.left || 0;
      const right = scope!.right || 200;
      const top = scope!.top || 0;
      const bottom = scope!.bottom || 300;

      const roiX = Math.round(baseCoord.x - left);
      const roiY = Math.round(baseCoord.y - top);
      const roiW = Math.round(Math.max(20, left + right));
      const roiH = Math.round(Math.max(20, top + bottom));

      return {
        x: roiX,
        y: roiY,
        width: roiW,
        height: roiH,
        label: `基于步骤 #${baseIndex + 1} 限制区域: ${roiW}×${roiH}px`
      };
    } else {
      return { x: maskX, y: maskY, width: maskW, height: maskH, label: '蒙版全域' };
    }
  }

  // 2. 基于蒙版限制
  if (scope && bt === 'mask') {
    const l = Number(scope.left) || 0;
    const r = Number(scope.right) || 0;
    const t = Number(scope.top) || 0;
    const b = Number(scope.bottom) || 0;
    const hasValue = l > 0 || r > 0 || t > 0 || b > 0;

    if (hasValue) {
      // 严格遵循 AGENTS.md 规范：用户配置的 left/right/top/bottom 100% 为像素 (px)
      // 严禁将像素值错误按百分比重复放大
      const minX = Math.min(l, r);
      const maxX = Math.max(l, r);
      const minY = Math.min(t, b);
      const maxY = Math.max(t, b);

      if (maxX > minX && maxY > minY) {
        const roiX = Math.round(maskX + minX);
        const roiY = Math.round(maskY + minY);
        const roiW = Math.round(Math.max(20, maxX - minX));
        const roiH = Math.round(Math.max(20, maxY - minY));

        return {
          x: roiX,
          y: roiY,
          width: roiW,
          height: roiH,
          label: `限制区域: ${roiW}×${roiH}px`
        };
      }
    }
  }

  return { x: maskX, y: maskY, width: maskW, height: maskH };
};

// 坐标转换工具：屏幕绝对物理点 -> 蒙版相对坐标
export const screenToMaskRel = (screenX: number, screenY: number) => ({
  x: Math.round(screenX - bounds.x),
  y: Math.round(screenY - bounds.y)
});

// 坐标转换工具：蒙版相对坐标 -> 屏幕绝对物理点
export const maskRelToScreen = (relX: number, relY: number) => ({
  x: Math.round(bounds.x + relX),
  y: Math.round(bounds.y + relY)
});

// 默认聚合导出 maskStore 对象
export const maskStore = {
  // 状态
  bounds,
  visible,
  isMinimized,
  isFullscreen,
  mode,
  context,
  runHitAnchor,
  searchROI,
  baseROI,
  lastBaseMarkerMap,

  // 位置与尺寸
  loadBoundsFromStorage,
  saveBoundsToStorage,
  syncFromNative,
  snapToBounds,
  alignToApp,
  setFullscreen,
  getUsableScreenBounds,

  // 显隐与穿透
  setVisible,
  setSelectingMode,
  hideTemporarilyForAction,
  restoreVisibility,

  // 交互选区
  startLimitSelection,
  startPointPicking,
  startROISelection,
  startOffsetMeasurement,
  cancelInteraction,

  // 标记与锚点
  setRunHitAnchor,
  clearRunHitAnchor,
  setSearchROI,
  clearSearchROI,
  setBaseROI,
  clearBaseROI,
  setBaseMarker,
  getBaseMarker,
  clearBaseMarkers,

  // 限制区域与坐标计算
  calculateEffectiveROI,
  screenToMaskRel,
  maskRelToScreen,

  // 通信
  broadcastMaskSync,
  handleMaskSyncMessage,
  pullLatestSyncFromNative
};

export default maskStore;
