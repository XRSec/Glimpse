import { ref, reactive, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { emit as tauriEmit, listen as tauriListen } from '@tauri-apps/api/event';
import type {
  AutomationScript,
  ScriptAction,
  ClickPositionAction,
  ClickTextAction,
  DragLineAction,
  DragCurveAction,
  ScrollAction,
  InputAction,
  DelayAction,
  LogEntry,
  MaskInteractionMode,
  MaskInteractionContext,
  BaseStepMarker,
  ActionType
} from '../types/script';
import { maskStore, isTauriEnv } from './maskStore';
import {
  setAppTargetHooks,
  fetchRunningApps,
  detectFrontmostApp,
  detectAppAtPoint,
  bindTargetAppToCurrentScript,
  applyAppWindowBounds,
  activateTargetApp,
  alignMaskTopLeftToApp,
  snapMaskToBounds,
  snapMaskToApp,
  setCustomTargetRegion,
  setMaskFullscreen,
  setFullscreenTargetRegion
} from './appTargetStore';
import {
  isRecording,
  setRecordingHooks,
  startRecording,
  stopRecording,
  handleRecordedClick,
  handleRecordedClickInternal
} from './scriptRecordingStore';
import {
  executionStatus,
  currentStepIndex,
  currentLoop,
  runningScript,
  setRunnerHooks,
  sleepWithControl,
  getScreenCoordinateOfAction,
  executeSingleAction,
  runScript,
  pauseScript,
  resumeScript,
  stopScript
} from './scriptRunner';
import { automationController } from '../services/automationController';

// 导出子模块内容
export {
  fetchRunningApps,
  detectFrontmostApp,
  detectAppAtPoint,
  bindTargetAppToCurrentScript,
  applyAppWindowBounds,
  activateTargetApp,
  alignMaskTopLeftToApp,
  snapMaskToBounds,
  snapMaskToApp,
  setCustomTargetRegion,
  setMaskFullscreen,
  setFullscreenTargetRegion,
  isRecording,
  startRecording,
  stopRecording,
  handleRecordedClick,
  executionStatus,
  currentStepIndex,
  currentLoop,
  runningScript,
  sleepWithControl,
  getScreenCoordinateOfAction,
  executeSingleAction,
  runScript,
  pauseScript,
  resumeScript,
  stopScript,
  isTauriEnv
};

import { DEFAULT_SCRIPTS } from '../types/defaultScripts';

// 本地持久化 Keys (严格匹配历史版本 key: glimpse_automation_scripts_v2)
const STORAGE_SCRIPTS_KEY_V2 = 'glimpse_automation_scripts_v2';
const STORAGE_SCRIPTS_KEY_LEGACY = 'glimpse_automation_scripts';

// 从本地存储读取用户保存的脚本数据 (多 key 容错)
const loadInitialScripts = (): AutomationScript[] => {
  if (typeof localStorage === 'undefined') return DEFAULT_SCRIPTS;
  try {
    const saved = localStorage.getItem(STORAGE_SCRIPTS_KEY_V2) || localStorage.getItem(STORAGE_SCRIPTS_KEY_LEGACY);
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

// 核心脚本与导航状态
export const scripts = ref<AutomationScript[]>(loadInitialScripts());
export const editingScript = ref<AutomationScript | null>(null);
export const activeScriptTitle = ref<string>('');
export const currentView = ref<'list' | 'edit' | 'settings' | 'about'>('list');

export const startCreateScript = () => {
  createNewScript();
  currentView.value = 'edit';
};

export const startEditScript = (script: AutomationScript) => {
  editingScript.value = JSON.parse(JSON.stringify(script));
  currentView.value = 'edit';
};

export const duplicateScript = (script: AutomationScript) => {
  const cloned: AutomationScript = JSON.parse(JSON.stringify(script));
  cloned.id = `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  cloned.title = `${cloned.title} (副本)`;
  cloned.updatedAt = Date.now();
  scripts.value.unshift(cloned);
  saveScriptsToStorage();
  addLog('success', `已复制生成脚本「${cloned.title}」`);
};


// 日志系统
export const logs = ref<LogEntry[]>([]);

export const addLog = (
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
  if (logs.value.length > 300) logs.value.pop();
  broadcastSync('log_added', { log: entry });
};

export const clearLogs = () => {
  logs.value = [];
  broadcastSync('logs_cleared');
};

// 跨窗口同步通道 (BroadcastChannel + Tauri Events + LocalStorage)
export const handleScriptSyncMessage = (msg: any) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'state_updated':
      if (msg.executionStatus) executionStatus.value = msg.executionStatus;
      if (msg.currentLoop !== undefined) currentLoop.value = msg.currentLoop;
      if (msg.currentStepIndex !== undefined) currentStepIndex.value = msg.currentStepIndex;
      if (msg.isRecording !== undefined) isRecording.value = msg.isRecording;
      if (msg.scriptTitle) activeScriptTitle.value = msg.scriptTitle;
      break;
    case 'log_added':
      if (msg.log && !logs.value.some(l => l.id === msg.log.id)) {
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
    case 'mask_limit_selected':
      handleMaskLimitSelectedInternal(msg.actionId, msg.left, msg.right, msg.top, msg.bottom);
      break;
    case 'mask_point_picked':
      handleMaskPointPickedInternal(msg.actionId, msg.targetField, msg.x, msg.y);
      break;
  }
};

let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('glimpse_window_sync_channel');
    syncChannel.onmessage = (event) => {
      handleScriptSyncMessage(event.data);
    };
  } catch (e) {
    console.warn('scriptStore BroadcastChannel 初始化失败', e);
  }
}

if (typeof window !== 'undefined') {
  (window as any).__glimpse_on_script_sync = (payload: any) => {
    handleScriptSyncMessage(payload);
  };

  try {
    tauriListen('glimpse_script_sync_event', (event: any) => {
      handleScriptSyncMessage(event.payload);
    }).catch(() => {});
  } catch (e) {}

  window.addEventListener('storage', (e) => {
    if (e.key === 'glimpse_script_sync_state' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.msg) handleScriptSyncMessage(parsed.msg);
      } catch (err) {}
    }
  });
}

export const broadcastSync = (type: string, data: Record<string, any> = {}) => {
  const payload = JSON.parse(JSON.stringify({ type, ...data }));
  if (syncChannel) {
    try {
      syncChannel.postMessage(payload);
    } catch (e) {}
  }
  try {
    tauriEmit('glimpse_script_sync_event', payload).catch(() => {});
  } catch (e) {}
  try {
    localStorage.setItem('glimpse_script_sync_state', JSON.stringify({ msg: payload, t: Date.now() }));
  } catch (e) {}
  if (isTauriEnv()) {
    try {
      invoke('broadcast_script_sync', { payload }).catch(() => {});
    } catch (e) {}
  }
};

// 依赖注入连接各子模块
setAppTargetHooks(addLog, () => editingScript.value);
setRecordingHooks(addLog, () => editingScript.value, broadcastSync, getScreenCoordinateOfAction);
setRunnerHooks(addLog, () => editingScript.value, broadcastSync);
automationController.setLogger((level, msg, details) => addLog(level, msg, details));

// 交互回填处理函数
const handleMaskPointPickedInternal = (actionId: string, targetField: string, x: number, y: number) => {
  maskStore.cancelInteraction();
  if (!editingScript.value) return;
  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  const rx = Math.round(x);
  const ry = Math.round(y);

  if (targetField === 'x,y' && targetAction.type === 'click_position') {
    (targetAction as ClickPositionAction).x = rx;
    (targetAction as ClickPositionAction).y = ry;
    addLog('success', `🎯 坐标拾取成功: 动作「${targetAction.name}」已回填 (${rx}, ${ry})`);
  } else if (targetField === 'startX,startY' && (targetAction.type === 'drag_line' || targetAction.type === 'drag_curve')) {
    (targetAction as any).startX = rx;
    (targetAction as any).startY = ry;
    addLog('success', `🎯 拖动起点拾取成功: (${rx}, ${ry})`);
  } else if (targetField === 'controlX,controlY' && targetAction.type === 'drag_curve') {
    (targetAction as DragCurveAction).controlX = rx;
    (targetAction as DragCurveAction).controlY = ry;
    addLog('success', `🎯 拐点拾取成功: (${rx}, ${ry})`);
  } else if (targetField === 'endX,endY' && (targetAction.type === 'drag_line' || targetAction.type === 'drag_curve')) {
    (targetAction as any).endX = rx;
    (targetAction as any).endY = ry;
    addLog('success', `🎯 终点拾取成功: (${rx}, ${ry})`);
  } else if (targetField === 'targetX,targetY' && targetAction.type === 'scroll') {
    (targetAction as ScrollAction).targetX = rx;
    (targetAction as ScrollAction).targetY = ry;
    addLog('success', `🎯 滚轮位置拾取成功: (${rx}, ${ry})`);
  }
};

const handleMaskLimitSelectedInternal = (
  actionId: string,
  left: number,
  right: number,
  top: number,
  bottom: number
) => {
  maskStore.cancelInteraction();
  if (!editingScript.value) return;

  if (actionId === 'target-app-region') {
    const absX = Math.round(maskStore.bounds.x + left);
    const absY = Math.round(maskStore.bounds.y + top);
    const w = Math.round(Math.abs(right - left));
    const h = Math.round(Math.abs(bottom - top));
    setCustomTargetRegion({ x: absX, y: absY, width: Math.max(50, w), height: Math.max(50, h) });
    return;
  }

  const targetAction = editingScript.value.actions.find(a => a.id === actionId);
  if (!targetAction) return;

  if (!targetAction.regionScope) {
    targetAction.regionScope = { baseType: 'mask' };
  }
  targetAction.regionScope.baseType = targetAction.regionScope.baseType || 'mask';
  targetAction.regionScope.left = Math.round(left);
  targetAction.regionScope.right = Math.round(right);
  targetAction.regionScope.top = Math.round(top);
  targetAction.regionScope.bottom = Math.round(bottom);

  addLog('success', `📐 限制区域更新:「${targetAction.name}」(左:${left}, 右:${right}, 上:${top}, 下:${bottom})`);
};

// 蒙版交互回调上报（含脚本业务逻辑）
export const reportMaskPointPicked = (x: number, y: number) => {
  const ctx = maskStore.context.value;
  broadcastSync('mask_point_picked', { actionId: ctx.actionId, targetField: ctx.targetField, x, y });
  handleMaskPointPickedInternal(ctx.actionId || '', ctx.targetField || '', x, y);
};

export const reportMaskLimitSelected = (left: number, right: number, top: number, bottom: number) => {
  const ctx = maskStore.context.value;
  broadcastSync('mask_limit_selected', { actionId: ctx.actionId, left, right, top, bottom });
  handleMaskLimitSelectedInternal(ctx.actionId || '', left, right, top, bottom);
};

// 单步调试与纯定位（直通 automationController 控制系统）
export const executeSingleActionDirectly = async (action: ScriptAction, stepIndex: number) => {
  return await automationController.testStepTarget(
    action,
    stepIndex,
    editingScript.value?.targetApp,
    editingScript.value?.actions || []
  );
};

export const markBaseStepAnchor = async (options: { targetStepIndex: number; actionId?: string; actionName?: string }) => {
  const actions = editingScript.value?.actions || [];
  if (options.targetStepIndex < 0 || options.targetStepIndex >= actions.length) return false;
  const targetAction = actions[options.targetStepIndex];
  const res = await automationController.locateStepTarget(
    targetAction,
    options.targetStepIndex,
    editingScript.value?.targetApp,
    actions
  );
  return res.success;
};

export const locateActionAndMark = async (action: ScriptAction, stepIndex: number) => {
  return await automationController.locateStepTarget(
    action,
    stepIndex,
    editingScript.value?.targetApp,
    editingScript.value?.actions || []
  );
};

// 脚本 CRUD
export const loadScriptsFromStorage = () => {
  scripts.value = loadInitialScripts();
};

export const saveScriptsToStorage = () => {
  try {
    localStorage.setItem(STORAGE_SCRIPTS_KEY_V2, JSON.stringify(scripts.value));
    localStorage.setItem(STORAGE_SCRIPTS_KEY_LEGACY, JSON.stringify(scripts.value));
  } catch (e) {
    console.error('保存脚本失败', e);
  }
};

export const createNewScript = (): AutomationScript => {
  const newScript: AutomationScript = {
    id: `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: '新建自动化脚本',
    notes: '',
    updatedAt: Date.now(),
    config: {
      defaultWaitSeconds: 1.0,
      executionSpeed: 1.0,
      repeatCount: 1,
      pauseOnFailure: true,
      exportMarkdownReport: false
    },
    actions: []
  };
  editingScript.value = newScript;
  return newScript;
};

export const saveCurrentScript = () => {
  if (!editingScript.value) return;
  editingScript.value.updatedAt = Date.now();
  const idx = scripts.value.findIndex(s => s.id === editingScript.value!.id);
  if (idx >= 0) {
    scripts.value[idx] = JSON.parse(JSON.stringify(editingScript.value));
  } else {
    scripts.value.unshift(JSON.parse(JSON.stringify(editingScript.value)));
  }
  saveScriptsToStorage();
  addLog('success', `💾 脚本「${editingScript.value.title}」已成功保存`);
};

export const deleteScript = (id: string) => {
  scripts.value = scripts.value.filter(s => s.id !== id);
  if (editingScript.value?.id === id) {
    editingScript.value = null;
  }
  saveScriptsToStorage();
  addLog('info', '脚本已删除');
};

export const createDefaultAction = (type: ActionType): ScriptAction => {
  const base = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isEnabled: true,
    isExpanded: true,
    customWaitSeconds: null,
    recognizeMode: 'local' as const,
    regionScope: { baseType: 'mask' as const }
  };

  switch (type) {
    case 'click_text':
      return { ...base, name: '', type: 'click_text', targetText: '', fuzzyMatch: true, offsetX: 0, offsetY: 0, timeoutSeconds: 5, button: 'left' };
    case 'click_position':
      return { ...base, name: '', type: 'click_position', x: 100, y: 100, button: 'left' };
    case 'drag_line':
      return { ...base, name: '', type: 'drag_line', startX: 100, startY: 100, endX: 300, endY: 300, durationSeconds: 0.5 };
    case 'drag_curve':
      return { ...base, name: '', type: 'drag_curve', startX: 100, startY: 100, controlX: 200, controlY: 150, endX: 300, endY: 300, durationSeconds: 0.8 };
    case 'scroll':
      return { ...base, name: '', type: 'scroll', direction: 'down', distance: 3 };
    case 'send_key':
      return { ...base, name: '', type: 'send_key', key: 'Enter', repeat: 1 };
    case 'delay':
      return { ...base, name: '', type: 'delay', seconds: 1.0 };
    default:
      return { ...base, name: '', type };
  }
};

// 在系统默认浏览器中打开外部链接
export const openExternalUrl = async (url: string) => {
  if (isTauriEnv()) {
    try {
      await invoke('open_external_url', { url });
      return;
    } catch (e) {}
  }
  window.open(url, '_blank');
};

// 聚合 scriptStore 对象导出
export const scriptStore = {
  scripts,
  editingScript,
  activeScriptTitle,
  currentView,
  executionStatus,
  currentStepIndex,
  currentLoop,
  runningScript,
  isRecording,
  logs,
  startCreateScript,
  startEditScript,
  duplicateScript,
  createNewScript,
  saveCurrentScript,
  deleteScript,
  createDefaultAction,
  addLog,
  clearLogs,
  broadcastSync,
  startRecording,
  stopRecording,
  runScript,
  pauseScript,
  resumeScript,
  stopScript,
  executeSingleActionDirectly,
  locateActionAndMark,
  markBaseStepAnchor,
  snapMaskToApp,
  snapMaskToBounds,
  setCustomTargetRegion,
  setFullscreenTargetRegion,
  fetchRunningApps,
  detectFrontmostApp,
  bindTargetAppToCurrentScript,
  activateTargetApp,
  openExternalUrl,
  reportMaskPointPicked,
  reportMaskLimitSelected
};

export default scriptStore;

