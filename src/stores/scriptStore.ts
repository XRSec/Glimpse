import { reactive, ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type {
  AutomationScript,
  ScriptAction,
  ActionType,
  ClickPositionAction,
  ClickTextAction,
  DragLineAction,
  DragCurveAction,
  ScrollAction,
  InputAction,
  OpenAction,
  RunScriptAction,
  UiWaitAction,
  SaveScreenshotAction,
  DelayAction,
  ConditionAction,
  ScriptConfig,
  ExecutionStatus,
  LogEntry,
  RegionBounds,
  MaskInteractionMode,
  MaskInteractionContext
} from '../types/script';

// 检查是否在 Tauri 环境中
export const isTauriEnv = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      '__TAURI__' in window ||
      (window as any).isTauri === true)
  );
};

// 默认示例预设脚本
const DEFAULT_SCRIPTS: AutomationScript[] = [
  {
    id: 'script-sample-login',
    title: '查找【登录】并点击',
    notes: '利用 Apple Vision 原生 OCR 识别屏幕上的“登录”按钮并自动点击，附带坐标校准',
    config: {
      defaultWaitSeconds: 1.0,
      repeatCount: 1,
      pauseOnFailure: true
    },
    updatedAt: Date.now() - 3600000 * 2,
    actions: [
      {
        id: 'act-ocr-login',
        name: 'OCR 定位并点击【登录】',
        type: 'click_text',
        isEnabled: true,
        isExpanded: true,
        targetText: '登录',
        fuzzyMatch: true,
        offsetX: 0,
        offsetY: 0,
        timeoutSeconds: 5,
        button: 'left',
        customWaitSeconds: 1.5,
        regionScope: { type: 'mask' }
      },
      {
        id: 'act-pos-confirm',
        name: '点击弹窗确认按钮',
        type: 'click_position',
        isEnabled: true,
        isExpanded: false,
        x: 640,
        y: 420,
        button: 'left',
        customWaitSeconds: 1.0,
        regionScope: { type: 'mask' }
      }
    ]
  },
  {
    id: 'script-sample-coord',
    title: '点击坐标 (500, 300)',
    notes: '自动化快速点击固定坐标位置，支持双击及右键操作，精确响应高刷新率屏幕',
    config: {
      defaultWaitSeconds: 1.0,
      repeatCount: 3,
      pauseOnFailure: true
    },
    updatedAt: Date.now() - 3600000 * 5,
    actions: [
      {
        id: 'act-pos-1',
        name: '快速双击目标区域',
        type: 'click_position',
        isEnabled: true,
        isExpanded: true,
        x: 500,
        y: 300,
        button: 'double',
        customWaitSeconds: null,
        regionScope: { type: 'mask' }
      },
      {
        id: 'act-text-verify',
        name: '查找【已完成】文字校验',
        type: 'click_text',
        isEnabled: true,
        isExpanded: false,
        targetText: '已完成',
        fuzzyMatch: false,
        offsetX: 10,
        offsetY: 0,
        timeoutSeconds: 3,
        button: 'left',
        customWaitSeconds: 0.5,
        regionScope: { type: 'mask' }
      }
    ]
  }
];

// 本地存储键
const STORAGE_KEY = 'glimpse_automation_scripts_v2';
const STORAGE_BOUNDS_KEY = 'glimpse_region_bounds_v2';

// 加载初始脚本数据
const loadInitialScripts = (): AutomationScript[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('读取本地脚本缓存失败，使用内置预设', e);
  }
  return DEFAULT_SCRIPTS;
};

// 加载初始选框区域
const loadInitialBounds = (): RegionBounds => {
  try {
    const saved = localStorage.getItem(STORAGE_BOUNDS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.width === 'number') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('读取本地选框缓存失败', e);
  }
  const defaultW = 600;
  const defaultH = 400;
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    x: Math.max(40, Math.floor((winW - defaultW) / 2)),
    y: Math.max(40, Math.floor((winH - defaultH) / 2)),
    width: defaultW,
    height: defaultH
  };
};

// 全局响应式状态
const scripts = ref<AutomationScript[]>(loadInitialScripts());
const currentView = ref<'list' | 'edit' | 'settings'>('list');
const editingScript = ref<AutomationScript | null>(null);

// 蒙版显示与尺寸状态
const showRegionMask = ref<boolean>(false);
const isMaskMinimized = ref<boolean>(false);
const isMaskFullscreen = ref<boolean>(false);
const regionBounds = reactive<RegionBounds>(loadInitialBounds());

// 执行状态机
const executionStatus = ref<ExecutionStatus>('idle');
const runningScript = ref<AutomationScript | null>(null);
const currentStepIndex = ref<number>(-1);
const currentLoop = ref<number>(0);
const logs = ref<LogEntry[]>([]);
const activeScriptTitle = ref<string>('');

// 录制状态
const isRecording = ref<boolean>(false);

// 蒙版神级联动交互状态
const maskInteractionMode = ref<MaskInteractionMode>('none');
const maskInteractionContext = ref<MaskInteractionContext>({ mode: 'none' });

// 持久化选框位置
const saveBoundsToStorage = () => {
  try {
    localStorage.setItem(STORAGE_BOUNDS_KEY, JSON.stringify(regionBounds));
  } catch (e) {
    console.error('保存选框位置失败', e);
  }
};

// 持久化脚本数据
const saveScriptsToStorage = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts.value));
  } catch (e) {
    console.error('保存脚本失败', e);
  }
};

// 多窗口跨窗口通信 (BroadcastChannel)
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('glimpse_window_sync_channel');
    syncChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'bounds_updated':
          if (msg.bounds) {
            Object.assign(regionBounds, msg.bounds);
            saveBoundsToStorage();
          }
          break;
        case 'visibility_updated':
          showRegionMask.value = Boolean(msg.show);
          if (msg.isMinimized !== undefined) isMaskMinimized.value = msg.isMinimized;
          if (msg.isFullscreen !== undefined) isMaskFullscreen.value = msg.isFullscreen;
          break;
        case 'state_updated':
          if (msg.executionStatus) executionStatus.value = msg.executionStatus;
          if (msg.currentLoop !== undefined) currentLoop.value = msg.currentLoop;
          if (msg.currentStepIndex !== undefined) currentStepIndex.value = msg.currentStepIndex;
          if (msg.isRecording !== undefined) isRecording.value = msg.isRecording;
          if (msg.scriptTitle) activeScriptTitle.value = msg.scriptTitle;
          if (msg.logs) logs.value = msg.logs;
          break;
        case 'log_added':
          if (msg.log) {
            logs.value.unshift(msg.log);
            if (logs.value.length > 300) logs.value.pop();
          }
          break;
        case 'logs_cleared':
          logs.value = [];
          break;
        case 'recorded_click':
          if (editingScript.value && isRecording.value) {
            handleRecordedClickInternal(msg.x, msg.y, msg.button);
          }
          break;
        case 'mask_interaction_start':
          maskInteractionMode.value = msg.context?.mode || 'none';
          maskInteractionContext.value = msg.context || { mode: 'none' };
          break;
        case 'mask_interaction_cancel':
          maskInteractionMode.value = 'none';
          maskInteractionContext.value = { mode: 'none' };
          addLog('info', '已退出蒙版交互拾取模式');
          break;
        case 'mask_point_picked':
          handleMaskPointPickedInternal(msg.actionId, msg.targetField, msg.x, msg.y);
          break;
        case 'mask_roi_selected':
          handleMaskRoiSelectedInternal(msg.actionId, msg.customX1, msg.customX2, msg.customY1, msg.customY2);
          break;
        case 'mask_offset_measured':
          handleMaskOffsetMeasuredInternal(msg.actionId, msg.relX1, msg.relX2, msg.relY1, msg.relY2);
          break;
        case 'mask_limit_selected':
          handleMaskLimitSelectedInternal(msg.actionId, msg.left, msg.right, msg.top, msg.bottom, msg.unit);
          break;
        case 'request_full_sync':
          broadcastSync('full_sync_response', {
            scriptTitle: editingScript.value?.title || runningScript.value?.title || activeScriptTitle.value || '未命名脚本',
            executionStatus: executionStatus.value,
            currentLoop: currentLoop.value,
            currentStepIndex: currentStepIndex.value,
            isRecording: isRecording.value,
            maskInteractionMode: maskInteractionMode.value,
            maskInteractionContext: maskInteractionContext.value,
            showRegionMask: showRegionMask.value,
            isMaskMinimized: isMaskMinimized.value,
            isMaskFullscreen: isMaskFullscreen.value,
            bounds: { ...regionBounds },
            logs: logs.value
          });
          break;
        case 'full_sync_response':
          if (msg.scriptTitle) activeScriptTitle.value = msg.scriptTitle;
          if (msg.executionStatus) executionStatus.value = msg.executionStatus;
          if (msg.currentLoop !== undefined) currentLoop.value = msg.currentLoop;
          if (msg.currentStepIndex !== undefined) currentStepIndex.value = msg.currentStepIndex;
          if (msg.isRecording !== undefined) isRecording.value = msg.isRecording;
          if (msg.maskInteractionMode !== undefined) maskInteractionMode.value = msg.maskInteractionMode;
          if (msg.maskInteractionContext !== undefined) maskInteractionContext.value = msg.maskInteractionContext;
          if (msg.showRegionMask !== undefined) showRegionMask.value = msg.showRegionMask;
          if (msg.isMaskMinimized !== undefined) isMaskMinimized.value = msg.isMaskMinimized;
          if (msg.isMaskFullscreen !== undefined) isMaskFullscreen.value = msg.isMaskFullscreen;
          if (msg.bounds) Object.assign(regionBounds, msg.bounds);
          if (msg.logs) logs.value = msg.logs;
          break;
      }
    };
  } catch (e) {
    console.warn('初始化 BroadcastChannel 失败', e);
  }
}

export const broadcastSync = (type: string, data: Record<string, any> = {}) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type, ...data });
    } catch (e) {
      console.warn('广播同步消息失败', e);
    }
  }
};

// 计算当前脚本标题
const currentScriptTitle = computed(() => {
  return (
    activeScriptTitle.value ||
    editingScript.value?.title ||
    runningScript.value?.title ||
    '未命名自动化脚本'
  );
});

// 控制系统级蒙版窗口显示/隐藏
export const setMaskVisible = async (show: boolean) => {
  showRegionMask.value = show;
  if (show) {
    isMaskMinimized.value = false;
  }
  broadcastSync('visibility_updated', {
    show,
    isMinimized: isMaskMinimized.value,
    isFullscreen: isMaskFullscreen.value
  });
  if (isTauriEnv()) {
    try {
      await invoke('show_mask_overlay', { show });
    } catch (e) {
      console.warn('invoke show_mask_overlay failed:', e);
    }
  }
};

// 日志记录函数
const addLog = (
  level: 'info' | 'success' | 'warn' | 'error',
  message: string,
  extra?: { actionId?: string; actionName?: string; stepIndex?: number }
) => {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  const entry: LogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    level,
    message,
    actionId: extra?.actionId,
    actionName: extra?.actionName,
    stepIndex: extra?.stepIndex
  };
  logs.value.unshift(entry);
  if (logs.value.length > 300) {
    logs.value.pop();
  }
  broadcastSync('log_added', { log: entry });
};

const clearLogs = () => {
  logs.value = [];
  broadcastSync('logs_cleared');
};

// 蒙版交互事件内部处理
const handleMaskPointPickedInternal = (actionId: string, targetField: string, x: number, y: number) => {
  maskInteractionMode.value = 'none';
  maskInteractionContext.value = { mode: 'none' };
  if (!editingScript.value) return;
  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  const rx = Math.round(x);
  const ry = Math.round(y);

  if (targetField === 'x,y' && targetAction.type === 'click_position') {
    (targetAction as ClickPositionAction).x = rx;
    (targetAction as ClickPositionAction).y = ry;
    addLog('success', `🎯 蒙版拾取坐标成功: 动作「${targetAction.name}」已回填坐标 (${rx}, ${ry})`);
  } else if (targetField === 'startX,startY' && (targetAction.type === 'drag_line' || targetAction.type === 'drag_curve')) {
    (targetAction as any).startX = rx;
    (targetAction as any).startY = ry;
    addLog('success', `🎯 蒙版起点拾取成功: 动作「${targetAction.name}」已回填起点 (${rx}, ${ry})`);
  } else if (targetField === 'controlX,controlY' && targetAction.type === 'drag_curve') {
    (targetAction as DragCurveAction).controlX = rx;
    (targetAction as DragCurveAction).controlY = ry;
    addLog('success', `🎯 蒙版控制点拾取成功: 动作「${targetAction.name}」已回填拐点 (${rx}, ${ry})`);
  } else if (targetField === 'endX,endY' && (targetAction.type === 'drag_line' || targetAction.type === 'drag_curve')) {
    (targetAction as any).endX = rx;
    (targetAction as any).endY = ry;
    addLog('success', `🎯 蒙版终点拾取成功: 动作「${targetAction.name}」已回填终点 (${rx}, ${ry})`);
  } else if (targetField === 'targetX,targetY' && targetAction.type === 'scroll') {
    (targetAction as ScrollAction).targetX = rx;
    (targetAction as ScrollAction).targetY = ry;
    addLog('success', `🎯 蒙版滚动坐标拾取成功: 动作「${targetAction.name}」已回填位置 (${rx}, ${ry})`);
  }
};

const handleMaskRoiSelectedInternal = (
  actionId: string,
  customX1: number,
  customX2: number,
  customY1: number,
  customY2: number
) => {
  maskInteractionMode.value = 'none';
  maskInteractionContext.value = { mode: 'none' };
  if (!editingScript.value) return;
  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  if (!targetAction.regionScope) {
    targetAction.regionScope = { type: 'custom' };
  }
  targetAction.regionScope.type = 'custom';
  targetAction.regionScope.customX1 = Math.round(customX1);
  targetAction.regionScope.customX2 = Math.round(customX2);
  targetAction.regionScope.customY1 = Math.round(customY1);
  targetAction.regionScope.customY2 = Math.round(customY2);

  addLog(
    'success',
    `📐 蒙版识别区域框选完成: 动作「${targetAction.name}」已回填局部区域 (X: ${targetAction.regionScope.customX1}~${targetAction.regionScope.customX2}, Y: ${targetAction.regionScope.customY1}~${targetAction.regionScope.customY2})`
  );
};

const handleMaskOffsetMeasuredInternal = (
  actionId: string,
  relX1: number,
  relX2: number,
  relY1: number,
  relY2: number
) => {
  maskInteractionMode.value = 'none';
  maskInteractionContext.value = { mode: 'none' };
  if (!editingScript.value) return;
  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  if (!targetAction.regionScope) {
    targetAction.regionScope = { type: 'relative_step' };
  }
  targetAction.regionScope.type = 'relative_step';
  targetAction.regionScope.relX1 = Math.round(relX1);
  targetAction.regionScope.relX2 = Math.round(relX2);
  targetAction.regionScope.relY1 = Math.round(relY1);
  targetAction.regionScope.relY2 = Math.round(relY2);

  addLog(
    'success',
    `⚡ 相对偏移自动测算成功: 动作「${targetAction.name}」已回填相对偏移 (relX: ${targetAction.regionScope.relX1}~${targetAction.regionScope.relX2}, relY: ${targetAction.regionScope.relY1}~${targetAction.regionScope.relY2})`
  );
};

const handleMaskLimitSelectedInternal = (
  actionId: string,
  left: number,
  right: number,
  top: number,
  bottom: number,
  unit: '%' | 'px' = 'px'
) => {
  maskInteractionMode.value = 'none';
  maskInteractionContext.value = { mode: 'none' };
  if (!editingScript.value) return;
  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  if (!targetAction.regionScope) {
    targetAction.regionScope = { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 };
  }
  targetAction.regionScope.left = Math.round(left);
  targetAction.regionScope.right = Math.round(right);
  targetAction.regionScope.top = Math.round(top);
  targetAction.regionScope.bottom = Math.round(bottom);

  addLog(
    'success',
    `📐 限制区域已设置 (px): 动作「${targetAction.name}」(左: ${targetAction.regionScope.left}px, 右: ${targetAction.regionScope.right}px, 上: ${targetAction.regionScope.top}px, 下: ${targetAction.regionScope.bottom}px)`
  );
};

// 启动蒙版坐标拾取
export const startMaskPointPicking = async (options: {
  actionId: string;
  targetField: string;
  actionName?: string;
}) => {
  await setMaskVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'picking_point',
    actionId: options.actionId,
    targetField: options.targetField,
    actionName: options.actionName,
    promptText: '请在蒙版区域内点击目标位置（按 ESC 取消）'
  };
  maskInteractionMode.value = 'picking_point';
  maskInteractionContext.value = ctx;
  broadcastSync('mask_interaction_start', { context: ctx });
  addLog('info', `🎯 已开启蒙版坐标拾取模式: 动作「${options.actionName || '目标动作'}」`);
};

// 启动蒙版框选识别区域
export const startMaskROISelection = async (options: {
  actionId: string;
  actionName?: string;
}) => {
  await setMaskVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'selecting_roi',
    actionId: options.actionId,
    actionName: options.actionName,
    promptText: '请在蒙版内按住鼠标左键拉拽出识别矩形（按 ESC 取消）'
  };
  maskInteractionMode.value = 'selecting_roi';
  maskInteractionContext.value = ctx;
  broadcastSync('mask_interaction_start', { context: ctx });
  addLog('info', `📐 已开启蒙版框选识别区域: 动作「${options.actionName || '目标动作'}」`);
};

// 启动蒙版相对偏移测算
export const startMaskOffsetMeasurement = async (options: {
  actionId: string;
  actionName?: string;
  targetStepIndex?: number;
}) => {
  await setMaskVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'measuring_offset',
    actionId: options.actionId,
    actionName: options.actionName,
    offsetStep: 1,
    promptText: '请先点击基准步骤位置，再点击或框选目标位置（按 ESC 取消）'
  };
  maskInteractionMode.value = 'measuring_offset';
  maskInteractionContext.value = ctx;
  broadcastSync('mask_interaction_start', { context: ctx });
  addLog('info', `⚡ 已开启相对偏移测算模式: 动作「${options.actionName || '目标动作'}」`);
};

// 启动蒙版选择识别限制区域 (严格对标截图 3)
export const startMaskLimitSelection = async (options: {
  actionId: string;
  actionName?: string;
  initialLimit?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    unit?: '%' | 'px';
  };
}) => {
  await setMaskVisible(true);
  const ctx: MaskInteractionContext = {
    mode: 'selecting_limit',
    actionId: options.actionId,
    actionName: options.actionName,
    targetField: 'limit',
    initialLimit: options.initialLimit,
    promptText: '选择识别区域'
  };
  maskInteractionMode.value = 'selecting_limit';
  maskInteractionContext.value = ctx;
  broadcastSync('mask_interaction_start', { context: ctx });
  addLog('info', `📐 已开启识别限制区域选区模式: 动作「${options.actionName || '目标动作'}」`);
};

// 取消蒙版交互
export const cancelMaskInteraction = () => {
  const previousMode = maskInteractionMode.value;
  maskInteractionMode.value = 'none';
  maskInteractionContext.value = { mode: 'none' };
  broadcastSync('mask_interaction_cancel');
  // 如果是选区限制区域模式取消，自动收起关闭蒙版
  if (previousMode === 'selecting_limit') {
    setMaskVisible(false);
  }
};

// 蒙版窗口完成拾取上报
export const reportMaskPointPicked = (x: number, y: number) => {
  const ctx = maskInteractionContext.value;
  if (!ctx.actionId || !ctx.targetField) return;
  broadcastSync('mask_point_picked', {
    actionId: ctx.actionId,
    targetField: ctx.targetField,
    x,
    y
  });
  handleMaskPointPickedInternal(ctx.actionId, ctx.targetField, x, y);
};

// 蒙版窗口完成选框上报
export const reportMaskRoiSelected = (
  customX1: number,
  customX2: number,
  customY1: number,
  customY2: number
) => {
  const ctx = maskInteractionContext.value;
  if (!ctx.actionId) return;
  broadcastSync('mask_roi_selected', {
    actionId: ctx.actionId,
    customX1,
    customX2,
    customY1,
    customY2
  });
  handleMaskRoiSelectedInternal(ctx.actionId, customX1, customX2, customY1, customY2);
};

// 蒙版窗口完成偏移测算上报
export const reportMaskOffsetMeasured = (
  relX1: number,
  relX2: number,
  relY1: number,
  relY2: number
) => {
  const ctx = maskInteractionContext.value;
  if (!ctx.actionId) return;
  broadcastSync('mask_offset_measured', {
    actionId: ctx.actionId,
    relX1,
    relX2,
    relY1,
    relY2
  });
  handleMaskOffsetMeasuredInternal(ctx.actionId, relX1, relX2, relY1, relY2);
};

// 蒙版窗口完成识别限制区域选区上报 (严格对标截图 3: 点击确定)
export const reportMaskLimitSelected = (
  left: number,
  right: number,
  top: number,
  bottom: number,
  unit: '%' | 'px' = '%'
) => {
  const ctx = maskInteractionContext.value;
  if (!ctx.actionId) return;
  broadcastSync('mask_limit_selected', {
    actionId: ctx.actionId,
    left,
    right,
    top,
    bottom,
    unit
  });
  handleMaskLimitSelectedInternal(ctx.actionId, left, right, top, bottom, unit);
  // 点击确定后关闭蒙版
  setMaskVisible(false);
};

// 创建新动作辅助方法（全面覆盖两级级联菜单中的所有动作类型）
export const createDefaultAction = (type: ActionType = 'click_position'): ScriptAction => {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const defaultRegionScope = { type: 'mask' as const };
  const centerX = Math.round(regionBounds.x + regionBounds.width / 2);
  const centerY = Math.round(regionBounds.y + regionBounds.height / 2);

  switch (type) {
    case 'click_position':
      return {
        id,
        name: '点击指定坐标',
        type: 'click_position',
        isEnabled: true,
        isExpanded: true,
        x: centerX,
        y: centerY,
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'click_image':
      return {
        id,
        name: '点击图片匹配',
        type: 'click_image',
        isEnabled: true,
        isExpanded: true,
        imageTemplatePath: '',
        similarity: 0.85,
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'click_text':
      return {
        id,
        name: 'OCR 查找文字并点击',
        type: 'click_text',
        isEnabled: true,
        isExpanded: true,
        targetText: '确认',
        fuzzyMatch: true,
        offsetX: 0,
        offsetY: 0,
        timeoutSeconds: 5,
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'click_color':
      return {
        id,
        name: '点击颜色位置',
        type: 'click_color',
        isEnabled: true,
        isExpanded: true,
        hexColor: '#3B82F6',
        tolerance: 10,
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'click_node':
      return {
        id,
        name: '点击界面节点',
        type: 'click_node',
        isEnabled: true,
        isExpanded: true,
        nodeSelector: 'AXButton',
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'ai_click':
      return {
        id,
        name: 'AI 意图智能点击',
        type: 'ai_click',
        isEnabled: true,
        isExpanded: true,
        prompt: '点击页面右下角的确认按钮',
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'drag_line':
      return {
        id,
        name: '拖动直线',
        type: 'drag_line',
        isEnabled: true,
        isExpanded: true,
        startX: Math.round(regionBounds.x + 60),
        startY: Math.round(regionBounds.y + 60),
        endX: Math.round(regionBounds.x + regionBounds.width - 60),
        endY: Math.round(regionBounds.y + regionBounds.height - 60),
        durationSeconds: 0.5,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'drag_curve':
      return {
        id,
        name: '拖动曲线 (拟人轨迹)',
        type: 'drag_curve',
        isEnabled: true,
        isExpanded: true,
        startX: Math.round(regionBounds.x + 60),
        startY: Math.round(regionBounds.y + 160),
        controlX: Math.round(regionBounds.x + regionBounds.width / 2),
        controlY: Math.round(regionBounds.y + 30),
        endX: Math.round(regionBounds.x + regionBounds.width - 60),
        endY: Math.round(regionBounds.y + 160),
        durationSeconds: 0.8,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'scroll':
      return {
        id,
        name: '鼠标滚轮滚动',
        type: 'scroll',
        isEnabled: true,
        isExpanded: true,
        direction: 'down',
        distance: 5,
        targetX: centerX,
        targetY: centerY,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'input_text':
      return {
        id,
        name: '输入文本内容',
        type: 'input_text',
        isEnabled: true,
        isExpanded: true,
        text: '自动化测试输入',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'paste_clipboard':
      return {
        id,
        name: '粘贴剪贴板',
        type: 'paste_clipboard',
        isEnabled: true,
        isExpanded: true,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'clear_and_input':
      return {
        id,
        name: '清空并输入',
        type: 'clear_and_input',
        isEnabled: true,
        isExpanded: true,
        text: '',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'open_app':
      return {
        id,
        name: '打开应用程序',
        type: 'open_app',
        isEnabled: true,
        isExpanded: true,
        target: 'Finder',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'open_url':
      return {
        id,
        name: '打开网址',
        type: 'open_url',
        isEnabled: true,
        isExpanded: true,
        target: 'https://',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'open_file':
      return {
        id,
        name: '打开文件',
        type: 'open_file',
        isEnabled: true,
        isExpanded: true,
        target: '',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'run_shell':
      return {
        id,
        name: '运行 Shell 脚本',
        type: 'run_shell',
        isEnabled: true,
        isExpanded: true,
        command: 'echo "Glimpse automation running"',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'run_applescript':
      return {
        id,
        name: '运行 AppleScript',
        type: 'run_applescript',
        isEnabled: true,
        isExpanded: true,
        command: 'display notification "Hello Glimpse"',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'wait_text_appear':
      return {
        id,
        name: '等待文字出现',
        type: 'wait_text_appear',
        isEnabled: true,
        isExpanded: true,
        targetText: '加载完成',
        timeoutSeconds: 10,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'wait_text_disappear':
      return {
        id,
        name: '等待文字消失',
        type: 'wait_text_disappear',
        isEnabled: true,
        isExpanded: true,
        targetText: '请稍候',
        timeoutSeconds: 10,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'save_screenshot':
      return {
        id,
        name: '截图保存',
        type: 'save_screenshot',
        isEnabled: true,
        isExpanded: true,
        savePath: '',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'delay':
      return {
        id,
        name: '延时等待',
        type: 'delay',
        isEnabled: true,
        isExpanded: true,
        seconds: 1.0,
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    case 'condition':
      return {
        id,
        name: '条件分支判断',
        type: 'condition',
        isEnabled: true,
        isExpanded: true,
        conditionType: 'text_exists',
        targetText: '确认',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };

    default:
      return {
        id,
        name: '点击指定坐标',
        type: 'click_position',
        isEnabled: true,
        isExpanded: true,
        x: centerX,
        y: centerY,
        button: 'left',
        customWaitSeconds: null,
        regionScope: defaultRegionScope
      };
  }
};

// 脚本 CRUD 操作
const createNewScript = (): AutomationScript => {
  const newScript: AutomationScript = {
    id: `script-${Date.now()}`,
    title: '未命名自动化脚本',
    notes: '',
    config: {
      defaultWaitSeconds: 1.0,
      repeatCount: 1,
      pauseOnFailure: true
    },
    actions: [],
    updatedAt: Date.now()
  };
  return newScript;
};

const startCreateScript = () => {
  const newScript = createNewScript();
  editingScript.value = JSON.parse(JSON.stringify(newScript));
  activeScriptTitle.value = editingScript.value?.title || '未命名自动化脚本';
  currentView.value = 'edit';
  // 注意：打开编辑页时，桌面蒙版默认关闭隐藏，只有按需（如运行或选区时）才打开
};

const startEditScript = (script: AutomationScript) => {
  editingScript.value = JSON.parse(JSON.stringify(script));
  activeScriptTitle.value = script.title;
  currentView.value = 'edit';
  // 注意：打开编辑页时，桌面蒙版默认关闭隐藏，只有按需（如运行或选区时）才打开
};

const saveCurrentScript = () => {
  if (!editingScript.value) return;
  editingScript.value.updatedAt = Date.now();
  const index = scripts.value.findIndex(s => s.id === editingScript.value?.id);
  if (index >= 0) {
    scripts.value[index] = JSON.parse(JSON.stringify(editingScript.value));
  } else {
    scripts.value.unshift(JSON.parse(JSON.stringify(editingScript.value)));
  }
  saveScriptsToStorage();
  addLog('success', `脚本「${editingScript.value.title}」已成功保存`);
};

const deleteScript = (id: string) => {
  const target = scripts.value.find(s => s.id === id);
  if (target) {
    scripts.value = scripts.value.filter(s => s.id !== id);
    saveScriptsToStorage();
    addLog('info', `脚本「${target.title}」已删除`);
  }
};

const duplicateScript = (script: AutomationScript) => {
  const cloned: AutomationScript = JSON.parse(JSON.stringify(script));
  cloned.id = `script-${Date.now()}`;
  cloned.title = `${cloned.title} (副本)`;
  cloned.updatedAt = Date.now();
  scripts.value.unshift(cloned);
  saveScriptsToStorage();
  addLog('info', `已克隆生成副本「${cloned.title}」`);
};

// 执行控制变量
let executionAbortController: { abort: boolean; pause: boolean } | null = null;

// 延时辅助函数
const sleepWithControl = async (ms: number, controller: { abort: boolean; pause: boolean }): Promise<boolean> => {
  const interval = 50;
  let elapsed = 0;
  while (elapsed < ms) {
    if (controller.abort) return false;
    while (controller.pause) {
      if (controller.abort) return false;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, Math.min(interval, ms - elapsed)));
    elapsed += interval;
  }
  return true;
};

// 计算动作的有效识别区域限制 (ROI)
export const calculateEffectiveROI = (
  action: ScriptAction,
  stepIndex: number,
  executedStepCoordinates: Record<number, { x: number; y: number }>
): { x: number; y: number; width: number; height: number } => {
  const scope = action.regionScope || { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 };
  const maskX = Math.round(regionBounds.x);
  const maskY = Math.round(regionBounds.y);
  const maskW = Math.round(regionBounds.width);
  const maskH = Math.round(regionBounds.height);

  // 1. 如果是基于某个前序步骤的点击位置进行限制 (例如: 右键打开菜单后，基于该位置精准查找菜单项)
  if (scope.baseType === 'step') {
    const baseIndex = scope.targetStepIndex ?? (stepIndex - 1);
    const baseCoord = executedStepCoordinates[baseIndex];

    if (baseCoord) {
      const left = scope.left || 0;
      const right = scope.right || 200;
      const top = scope.top || 0;
      const bottom = scope.bottom || 300;

      const roiX = Math.round(baseCoord.x - left);
      const roiY = Math.round(baseCoord.y - top);
      const roiW = Math.round(Math.max(10, left + right));
      const roiH = Math.round(Math.max(10, top + bottom));

      addLog(
        'info',
        `🎯 基于步骤 #${baseIndex + 1} 点击位置 (${baseCoord.x}, ${baseCoord.y}) 限定识别范围: X=${roiX}, Y=${roiY}, 宽=${roiW}px, 高=${roiH}px`
      );
      return { x: roiX, y: roiY, width: roiW, height: roiH };
    } else {
      addLog('warn', `未能获取基准步骤 #${baseIndex + 1} 的执行坐标，已自动回退到运行蒙版区域`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
      return { x: maskX, y: maskY, width: maskW, height: maskH };
    }
  }

  // 2. 默认：基于脚本运行蒙版限制 (数值像素 px)
  if (
    scope.left !== undefined &&
    scope.right !== undefined &&
    scope.top !== undefined &&
    scope.bottom !== undefined &&
    scope.right > 0 &&
    scope.bottom > 0
  ) {
    const minX = Math.min(scope.left, scope.right);
    const maxX = Math.max(scope.left, scope.right);
    const minY = Math.min(scope.top, scope.bottom);
    const maxY = Math.max(scope.top, scope.bottom);

    const roiX = Math.round(maskX + minX);
    const roiY = Math.round(maskY + minY);
    const roiW = Math.round(Math.max(10, maxX - minX));
    const roiH = Math.round(Math.max(10, maxY - minY));

    return { x: roiX, y: roiY, width: roiW, height: roiH };
  }

  return { x: maskX, y: maskY, width: maskW, height: maskH };
};

// 执行单个动作
const executeSingleAction = async (
  action: ScriptAction,
  stepIndex: number,
  globalWait: number,
  controller: { abort: boolean; pause: boolean },
  executedStepCoordinates: Record<number, { x: number; y: number }>
): Promise<boolean> => {
  currentStepIndex.value = stepIndex;
  broadcastSync('state_updated', { currentStepIndex: stepIndex });

  if (!action.isEnabled) {
    addLog('info', `跳过已禁用动作: #${stepIndex + 1}「${action.name}」`, {
      actionId: action.id,
      actionName: action.name,
      stepIndex
    });
    return true;
  }

  addLog('info', `开始执行步骤 #${stepIndex + 1}「${action.name}」...`, {
    actionId: action.id,
    actionName: action.name,
    stepIndex
  });

  // 计算并打印识别区域限制
  const roi = calculateEffectiveROI(action, stepIndex, executedStepCoordinates);
  addLog('info', `🎯 正在使用区域限制查找: (X: ${roi.x}, Y: ${roi.y}, W: ${roi.width}, H: ${roi.height})`, {
    actionId: action.id,
    actionName: action.name,
    stepIndex
  });

  let isSuccess = true;
  try {
    if (action.type === 'click_position') {
      const btnText = action.button === 'left' ? '左键点击' : action.button === 'double' ? '双击' : '右键点击';

      // 确定实际点击目标坐标
      let targetX = action.x;
      let targetY = action.y;

      if (action.regionScope?.type === 'relative_step') {
        const baseIndex = action.regionScope.targetStepIndex ?? (stepIndex - 1);
        const baseCoord = executedStepCoordinates[baseIndex];
        if (baseCoord) {
          const rx = action.regionScope.relX1 ?? 0;
          const ry = action.regionScope.relY1 ?? 0;
          targetX = Math.round(baseCoord.x + rx);
          targetY = Math.round(baseCoord.y + ry);
        }
      }

      addLog('info', `移动光标至坐标 (${targetX}, ${targetY}) 并触发 ${btnText}`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });

      if (isTauriEnv()) {
        await invoke('click_position', {
          x: targetX,
          y: targetY,
          button: action.button
        });
      } else {
        const ok = await sleepWithControl(200, controller);
        if (!ok) return false;
      }

      // 记录实际点击坐标，供后续步骤引用
      executedStepCoordinates[stepIndex] = { x: targetX, y: targetY };

      addLog('success', `坐标 (${targetX}, ${targetY}) ${btnText}完成`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    } else if (action.type === 'click_text') {
      const matchMode = action.fuzzyMatch ? '模糊匹配' : '精确匹配';
      addLog('info', `OCR 视觉检索文字:「${action.targetText}」(${matchMode}, 超时: ${action.timeoutSeconds}s)`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });

      if (isTauriEnv()) {
        const res: any = await invoke('click_text_ocr', {
          targetText: action.targetText,
          isFuzzy: action.fuzzyMatch,
          offsetX: action.offsetX,
          offsetY: action.offsetY,
          timeoutSeconds: action.timeoutSeconds,
          button: action.button,
          roiX: roi.x,
          roiY: roi.y,
          roiW: roi.width,
          roiH: roi.height
        });
        if (res && res.success) {
          const finalX = res.x ?? Math.round(roi.x + roi.width / 2 + action.offsetX);
          const finalY = res.y ?? Math.round(roi.y + roi.height / 2 + action.offsetY);
          executedStepCoordinates[stepIndex] = { x: finalX, y: finalY };

          addLog('success', res.message || `OCR 点击完成:「${action.targetText}」(${Math.round(finalX)}, ${Math.round(finalY)})`, {
            actionId: action.id,
            actionName: action.name,
            stepIndex
          });
        } else {
          addLog('error', res?.message || `OCR 未在指定区域内找到「${action.targetText}」`, {
            actionId: action.id,
            actionName: action.name,
            stepIndex
          });
          isSuccess = false;
        }
      } else {
        const ok = await sleepWithControl(350, controller);
        if (!ok) return false;

        if (!action.targetText.trim()) {
          addLog('error', `OCR 检索失败: 目标文字为空`, {
            actionId: action.id,
            actionName: action.name,
            stepIndex
          });
          isSuccess = false;
        } else {
          const simX = Math.round(roi.x + Math.min(roi.width * 0.4, 60) + action.offsetX);
          const simY = Math.round(roi.y + Math.min(roi.height * 0.4, 30) + action.offsetY);
          executedStepCoordinates[stepIndex] = { x: simX, y: simY };

          addLog('success', `OCR 定位成功「${action.targetText}」, 偏移校准后点击坐标 (${simX}, ${simY})`, {
            actionId: action.id,
            actionName: action.name,
            stepIndex
          });
        }
      }
    } else if (action.type === 'drag_line') {
      const act = action as DragLineAction;
      const duration = act.durationSeconds || 0.5;
      addLog('info', `直线拖拽: 从 (${act.startX}, ${act.startY}) 拖拽至 (${act.endX}, ${act.endY}) (耗时 ${duration}s)`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });

      if (isTauriEnv()) {
        await invoke('drag_line', {
          x1: act.startX,
          y1: act.startY,
          x2: act.endX,
          y2: act.endY,
          durationSeconds: duration
        });
      } else {
        const ok = await sleepWithControl(duration * 1000, controller);
        if (!ok) return false;
      }

      executedStepCoordinates[stepIndex] = { x: act.endX, y: act.endY };
      addLog('success', `直线拖拽完成: 已到达终点 (${act.endX}, ${act.endY})`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    } else if (action.type === 'drag_curve') {
      const act = action as DragCurveAction;
      const duration = act.durationSeconds || 0.8;
      addLog('info', `曲线平滑拖拽: 起点 (${act.startX}, ${act.startY}) -> 拐点 (${act.controlX}, ${act.controlY}) -> 终点 (${act.endX}, ${act.endY})`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });

      if (isTauriEnv()) {
        await invoke('drag_curve', {
          x1: act.startX,
          y1: act.startY,
          controlX: act.controlX,
          controlY: act.controlY,
          x2: act.endX,
          y2: act.endY,
          durationSeconds: duration
        });
      } else {
        const ok = await sleepWithControl(duration * 1000, controller);
        if (!ok) return false;
      }

      executedStepCoordinates[stepIndex] = { x: act.endX, y: act.endY };
      addLog('success', `曲线平滑拖拽完成: 已到达终点 (${act.endX}, ${act.endY})`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    } else if (action.type === 'scroll') {
      const act = action as ScrollAction;
      const dirText = act.direction === 'up' ? '向上' : '向下';
      addLog('info', `鼠标滚轮${dirText}滚动 ${act.distance} 步${act.targetX != null ? ` (在坐标 ${act.targetX}, ${act.targetY})` : ''}`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });

      if (isTauriEnv()) {
        await invoke('scroll', {
          direction: act.direction,
          distance: act.distance,
          x: act.targetX ?? null,
          y: act.targetY ?? null
        });
      } else {
        const ok = await sleepWithControl(300, controller);
        if (!ok) return false;
      }

      if (act.targetX != null && act.targetY != null) {
        executedStepCoordinates[stepIndex] = { x: act.targetX, y: act.targetY };
      }
      addLog('success', `滚轮${dirText}滚动完成`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    } else if (action.type === 'delay') {
      const act = action as DelayAction;
      const waitTime = act.seconds || 1.0;
      addLog('info', `执行动作专有延时等待: ${waitTime} 秒`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
      const ok = await sleepWithControl(waitTime * 1000, controller);
      if (!ok) return false;
      addLog('success', `延时等待完成`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    } else {
      // 通用/其他动作降级与日志
      addLog('info', `执行动作「${action.name}」(类型: ${action.type})...`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
      const ok = await sleepWithControl(250, controller);
      if (!ok) return false;
      addLog('success', `动作「${action.name}」已顺利完成`, {
        actionId: action.id,
        actionName: action.name,
        stepIndex
      });
    }
  } catch (err: any) {
    addLog('error', `步骤执行异常: ${err?.message || '未知错误'}`, {
      actionId: action.id,
      actionName: action.name,
      stepIndex
    });
    isSuccess = false;
  }

  const waitSeconds =
    action.customWaitSeconds != null && !isNaN(action.customWaitSeconds)
      ? Number(action.customWaitSeconds)
      : globalWait;

  if (waitSeconds > 0) {
    addLog('info', `等待 ${waitSeconds.toFixed(1)} 秒 (后置延时)...`, {
      actionId: action.id,
      actionName: action.name,
      stepIndex
    });
    const waitOk = await sleepWithControl(waitSeconds * 1000, controller);
    if (!waitOk) return false;
  }

  return isSuccess;
};

// 运行指定脚本
const runScript = async (script: AutomationScript) => {
  if (executionStatus.value === 'running') {
    addLog('warn', '当前已有任务正在执行，请先停止');
    return;
  }

  runningScript.value = script;
  activeScriptTitle.value = script.title;
  executionStatus.value = 'running';
  currentStepIndex.value = -1;
  currentLoop.value = 0;

  broadcastSync('state_updated', {
    executionStatus: 'running',
    scriptTitle: script.title,
    currentStepIndex: -1,
    currentLoop: 0
  });

  executionAbortController = { abort: false, pause: false };
  const controller = executionAbortController;

  const repeatTarget = script.config.repeatCount ?? 1;
  const isInfinite = repeatTarget === 0;
  const globalWait = script.config.defaultWaitSeconds ?? 1.0;
  const pauseOnFailure = script.config.pauseOnFailure ?? true;

  addLog('info', `▶ 开始执行脚本「${script.title}」(计划循环: ${isInfinite ? '无限循环' : repeatTarget + '次'})`);

  // 记录每个步骤成功执行后的实际点击坐标，供后续步骤基于前序步骤相对偏移
  const executedStepCoordinates: Record<number, { x: number; y: number }> = {};

  let loopCount = 0;
  while (!controller.abort) {
    loopCount++;
    currentLoop.value = loopCount;
    broadcastSync('state_updated', { currentLoop: loopCount });
    addLog('info', `--- 进入第 ${loopCount} 轮循环 ---`);

    for (let i = 0; i < script.actions.length; i++) {
      if (controller.abort) break;

      while (controller.pause) {
        if (controller.abort) break;
        await new Promise(r => setTimeout(r, 100));
      }

      const action = script.actions[i];
      const stepSuccess = await executeSingleAction(action, i, globalWait, controller, executedStepCoordinates);

      if (!stepSuccess && pauseOnFailure) {
        addLog('error', `检测到动作失败且开启了「有动作失败立即暂停」，已暂停执行`);
        executionStatus.value = 'paused';
        broadcastSync('state_updated', { executionStatus: 'paused' });
        controller.pause = true;
        while (controller.pause) {
          if (controller.abort) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (controller.abort) break;
      }
    }

    if (controller.abort) break;

    if (!isInfinite && loopCount >= repeatTarget) {
      break;
    }
  }

  if (controller.abort) {
    executionStatus.value = 'stopped';
    broadcastSync('state_updated', { executionStatus: 'stopped' });
    addLog('warn', `⏹ 脚本「${script.title}」已终止运行`);
  } else {
    executionStatus.value = 'completed';
    broadcastSync('state_updated', { executionStatus: 'completed' });
    addLog('success', `✔ 脚本「${script.title}」全部执行完毕！共完成 ${loopCount} 轮循环`);
  }

  setTimeout(() => {
    if (executionStatus.value === 'completed' || executionStatus.value === 'stopped') {
      executionStatus.value = 'idle';
      currentStepIndex.value = -1;
      runningScript.value = null;
      broadcastSync('state_updated', { executionStatus: 'idle', currentStepIndex: -1 });
    }
  }, 1500);
};

// 暂停执行
const pauseScript = () => {
  if (executionStatus.value === 'running' && executionAbortController) {
    executionAbortController.pause = true;
    executionStatus.value = 'paused';
    broadcastSync('state_updated', { executionStatus: 'paused' });
    addLog('warn', '⏸ 用户手动暂停了脚本运行');
  }
};

// 继续执行
const resumeScript = () => {
  if (executionStatus.value === 'paused' && executionAbortController) {
    executionAbortController.pause = false;
    executionStatus.value = 'running';
    broadcastSync('state_updated', { executionStatus: 'running' });
    addLog('info', '▶ 恢复脚本运行');
  }
};

// 停止执行
const stopScript = () => {
  if (executionAbortController) {
    executionAbortController.abort = true;
    executionAbortController.pause = false;
  }
  executionStatus.value = 'stopped';
  broadcastSync('state_updated', { executionStatus: 'stopped' });
  addLog('warn', '⏹ 用户发出停止指令');
  setTimeout(() => {
    executionStatus.value = 'idle';
    currentStepIndex.value = -1;
    runningScript.value = null;
    broadcastSync('state_updated', { executionStatus: 'idle', currentStepIndex: -1 });
  }, 500);
};

// 录制相关控制
const startRecording = () => {
  isRecording.value = true;
  broadcastSync('state_updated', { isRecording: true });
  addLog('info', '🔴 智能录制已启动：在屏幕或运行区域内任意点击，即可自动追加对应的点击位置动作');
};

const stopRecording = () => {
  isRecording.value = false;
  broadcastSync('state_updated', { isRecording: false });
  addLog('info', '录制已结束');
};

const handleRecordedClickInternal = (x: number, y: number, button: 'left' | 'double' | 'right' = 'left') => {
  if (!editingScript.value) return;
  const newAction: ClickPositionAction = {
    id: `act-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: `录制点击 (${Math.round(x)}, ${Math.round(y)})`,
    type: 'click_position',
    isEnabled: true,
    isExpanded: true,
    x: Math.round(x),
    y: Math.round(y),
    button,
    customWaitSeconds: null,
    regionScope: { type: 'mask' }
  };
  editingScript.value.actions.push(newAction);
  addLog('success', `录制新增动作: 点击坐标 (${newAction.x}, ${newAction.y})`);
};

const handleRecordedClick = (x: number, y: number, button: 'left' | 'double' | 'right' = 'left') => {
  broadcastSync('recorded_click', { x, y, button });
  if (editingScript.value && isRecording.value) {
    handleRecordedClickInternal(x, y, button);
  }
};

export const scriptStore = {
  // 基础状态
  scripts,
  currentView,
  editingScript,

  // 蒙版状态与区域
  showRegionMask,
  isMaskMinimized,
  isMaskFullscreen,
  regionBounds,
  saveBoundsToStorage,
  setMaskVisible,
  broadcastSync,

  // 蒙版神级联动
  maskInteractionMode,
  maskInteractionContext,
  startMaskPointPicking,
  startMaskROISelection,
  startMaskOffsetMeasurement,
  startMaskLimitSelection,
  cancelMaskInteraction,
  reportMaskPointPicked,
  reportMaskRoiSelected,
  reportMaskOffsetMeasured,
  reportMaskLimitSelected,

  // 执行状态
  executionStatus,
  runningScript,
  currentStepIndex,
  currentLoop,
  logs,
  currentScriptTitle,
  activeScriptTitle,

  // 录制
  isRecording,
  startRecording,
  stopRecording,
  handleRecordedClick,

  // 辅助方法
  addLog,
  clearLogs,
  createNewScript,
  startCreateScript,
  startEditScript,
  saveCurrentScript,
  deleteScript,
  duplicateScript,

  // 运行控制
  runScript,
  pauseScript,
  resumeScript,
  stopScript
};
