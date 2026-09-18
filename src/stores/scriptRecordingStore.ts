import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv, maskStore } from './maskStore';
import { activateTargetApp, snapMaskToApp, bindTargetAppToCurrentScript } from './appTargetStore';
import type { ClickPositionAction, RegionScopeConfig } from '../types/script';

export const isRecording = ref(false);

let logFn: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void = () => {};
let getEditingScriptFn: () => any = () => null;
let broadcastSyncFn: (type: string, data?: any) => void = () => {};
let getScreenCoordFn: (idx: number) => { x: number; y: number } = () => ({ x: 0, y: 0 });

export const setRecordingHooks = (
  logger: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void,
  getScript: () => any,
  broadcast: (type: string, data?: any) => void,
  getScreenCoord: (idx: number) => { x: number; y: number }
) => {
  logFn = logger;
  getEditingScriptFn = getScript;
  broadcastSyncFn = broadcast;
  getScreenCoordFn = getScreenCoord;
};

// 开启智能录制
export const startRecording = async (): Promise<boolean> => {
  const editingScript = getEditingScriptFn();
  if (!editingScript?.targetApp?.appName || !editingScript?.targetApp?.initialBounds) {
    logFn('warn', '⚠️ 开启录制前必须先选择并绑定目标应用窗口！');
    alert('⚠️ 无法录制：请先绑定目标应用窗口！\n\n自动化脚本基于目标窗口建立统一物理坐标系，必须先在「目标应用与窗口尺寸管理」中绑定窗口。');
    return false;
  }

  if (editingScript.targetApp) {
    if (editingScript.targetApp.autoFocusOnRun !== false) {
      await activateTargetApp(editingScript.targetApp);
    }
    await snapMaskToApp(editingScript.targetApp);
    await maskStore.setVisible(true);
  }

  isRecording.value = true;
  broadcastSyncFn('state_updated', { isRecording: true });
  logFn('info', '🔴 智能录制已启动：在目标窗口区域内任意点击，即可自动追加对应的点击位置动作');

  if (isTauriEnv()) {
    try {
      await invoke('start_recording_clicks');
    } catch (e) {
      console.warn('start_recording_clicks failed:', e);
    }
  }
  return true;
};

// 结束智能录制
export const stopRecording = async () => {
  isRecording.value = false;
  broadcastSyncFn('state_updated', { isRecording: false });
  logFn('info', '录制已结束');

  if (isTauriEnv()) {
    try {
      await invoke('stop_recording_clicks');
    } catch (e) {
      console.warn('stop_recording_clicks failed:', e);
    }
  }
};

// 录制点击内部追加逻辑
export const handleRecordedClickInternal = (
  x: number,
  y: number,
  button: 'left' | 'double' | 'right' = 'left'
) => {
  const editingScript = getEditingScriptFn();
  if (!editingScript) return;

  const rx = Math.round(x);
  const ry = Math.round(y);
  const isRight = button === 'right';
  const actions = editingScript.actions;
  const prevIndex = actions.length - 1;

  if (!editingScript.targetApp || !editingScript.targetApp.initialBounds) {
    if (isTauriEnv()) {
      invoke('get_app_at_point', { x: rx, y: ry })
        .then((appInfo: any) => {
          if (appInfo && appInfo.appName && editingScript && (!editingScript.targetApp || !editingScript.targetApp.initialBounds)) {
            bindTargetAppToCurrentScript(appInfo);
          }
        })
        .catch(() => {});
    }
  }

  let actionX = rx;
  let actionY = ry;
  let scope: RegionScopeConfig = { baseType: 'mask' };
  let logExtra = '';

  if (isRight && prevIndex >= 0) {
    const baseCoord = getScreenCoordFn(prevIndex);
    actionX = rx - baseCoord.x;
    actionY = ry - baseCoord.y;
    scope = {
      baseType: 'step',
      targetStepIndex: prevIndex,
      left: 30,
      right: 30,
      top: 50,
      bottom: 50
    };
    logExtra = ` (基于步骤 #${prevIndex + 1} 相对偏移 ${actionX >= 0 ? '+' : ''}${actionX}, ${actionY >= 0 ? '+' : ''}${actionY}，限制: 左右±30 上下±50)`;
  } else {
    const maskX = Math.round(maskStore.bounds.x);
    const maskY = Math.round(maskStore.bounds.y);
    if (maskStore.visible.value) {
      actionX = rx - maskX;
      actionY = ry - maskY;
    }
    scope = { baseType: 'mask' };
  }

  const btnName = isRight ? '右键' : button === 'double' ? '双击' : '点击';
  const newAction: ClickPositionAction = {
    id: `act-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: `录制${btnName} (${rx}, ${ry})`,
    type: 'click_position',
    isEnabled: true,
    isExpanded: false,
    x: actionX,
    y: actionY,
    button,
    customWaitSeconds: null,
    regionScope: scope
  };
  editingScript.actions.push(newAction);
  logFn('success', `录制新增动作: ${btnName}屏幕坐标 (${rx}, ${ry})${logExtra}`);
};

export const handleRecordedClick = (
  x: number,
  y: number,
  button: 'left' | 'double' | 'right' = 'left'
) => {
  broadcastSyncFn('recorded_click', { x, y, button });
  const editingScript = getEditingScriptFn();
  if (editingScript && isRecording.value) {
    handleRecordedClickInternal(x, y, button);
  }
};
