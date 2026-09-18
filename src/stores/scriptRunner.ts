import { ref, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv, maskStore } from './maskStore';
import { activateTargetApp, applyAppWindowBounds, snapMaskToApp } from './appTargetStore';
import { ocrAuditLogger } from '../services/ocrAuditLogger';
import { cuaDriver } from '../services/cuaDriverService';
import type {
  AutomationScript,
  ScriptAction,
  ClickPositionAction,
  ClickTextAction,
  DragLineAction,
  DragCurveAction,
  ScrollAction,
  DelayAction
} from '../types/script';

// 运行时状态
export const executionStatus = ref<'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'stopping'>('idle');
export const currentStepIndex = ref(-1);
export const currentLoop = ref(0);
export const runningScript = ref<AutomationScript | null>(null);
let lastStopTimestamp = 0;

let executionAbortController: { abort: boolean; pause: boolean } | null = null;

// 外部钩子注入
let logFn: (level: 'info' | 'success' | 'warn' | 'error', message: string, details?: any) => void = () => {};
let getEditingScriptFn: () => any = () => null;
let broadcastSyncFn: (type: string, data?: any) => void = () => {};

export const setRunnerHooks = (
  logger: (level: 'info' | 'success' | 'warn' | 'error', message: string, details?: any) => void,
  getScript: () => any,
  broadcast: (type: string, data?: any) => void
) => {
  logFn = logger;
  getEditingScriptFn = getScript;
  broadcastSyncFn = broadcast;
};

// 延时辅助函数
export const sleepWithControl = async (
  ms: number,
  controller: { abort: boolean; pause: boolean }
): Promise<boolean> => {
  const interval = 50;
  let elapsed = 0;
  while (elapsed < ms) {
    if (controller.abort) return false;
    while (controller.pause) {
      if (controller.abort) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, Math.min(interval, ms - elapsed)));
    elapsed += interval;
  }
  return true;
};

// 计算步骤在屏幕上的绝对物理基准坐标
export const getScreenCoordinateOfAction = (index: number): { x: number; y: number } => {
  const script = runningScript.value || getEditingScriptFn();
  if (!script || index < 0 || index >= script.actions.length) {
    return { x: Math.round(maskStore.bounds.x), y: Math.round(maskStore.bounds.y) };
  }
  const act = script.actions[index];
  if (act.type === 'click_position') {
    const cp = act as ClickPositionAction;
    if (cp.regionScope?.baseType === 'step') {
      const baseIdx = cp.regionScope.targetStepIndex ?? (index - 1);
      const baseCoord = getScreenCoordinateOfAction(baseIdx);
      return {
        x: Math.round(baseCoord.x + (cp.x || 0)),
        y: Math.round(baseCoord.y + (cp.y || 0))
      };
    } else {
      return {
        x: Math.round(maskStore.bounds.x + (cp.x || 0)),
        y: Math.round(maskStore.bounds.y + (cp.y || 0))
      };
    }
  } else if (act.type === 'drag_line' || act.type === 'drag_curve') {
    return {
      x: Math.round(maskStore.bounds.x + ((act as any).endX || 0)),
      y: Math.round(maskStore.bounds.y + ((act as any).endY || 0))
    };
  }
  // OCR 或识别动作优先使用缓存的实际命中点
  const cached = maskStore.getBaseMarker(index);
  if (cached) {
    return { x: cached.x, y: cached.y };
  }
  return { x: Math.round(maskStore.bounds.x), y: Math.round(maskStore.bounds.y) };
};

// 执行单个动作
export const executeSingleAction = async (
  action: ScriptAction,
  stepIndex: number,
  globalWait: number,
  controller: { abort: boolean; pause: boolean },
  executedStepCoordinates: Record<number, { x: number; y: number }>
): Promise<boolean> => {
  currentStepIndex.value = stepIndex;
  broadcastSyncFn('state_updated', { currentStepIndex: stepIndex });
  await nextTick();

  // 同步原生蒙版物理位置
  await maskStore.syncFromNative();

  if (!action.isEnabled) {
    logFn('info', `跳过已禁用动作: #${stepIndex + 1}「${action.name}」`, { actionId: action.id, stepIndex });
    return true;
  }

  logFn('info', `开始执行步骤 #${stepIndex + 1}「${action.name}」...`, { actionId: action.id, stepIndex });

  // 先推导并立刻在蒙版上绘制当前步骤限制区域矩形 (铁律：先画框后识别)
  let roi = maskStore.calculateEffectiveROI(action, stepIndex, executedStepCoordinates);
  if (action.regionScope?.baseType === 'mask') {
    roi = {
      x: Math.round(maskStore.bounds.x),
      y: Math.round(maskStore.bounds.y),
      width: Math.round(maskStore.bounds.width),
      height: Math.round(maskStore.bounds.height)
    };
  }
  maskStore.setSearchROI(roi);

  // 若当前步骤基于前序步骤，高亮前序基准绿框；否则清理历史绿框，保持画面干净
  if (action.regionScope?.baseType === 'step') {
    const baseIndex = action.regionScope.targetStepIndex ?? (stepIndex - 1);
    const baseCoord = executedStepCoordinates[baseIndex] || maskStore.getBaseMarker(baseIndex);
    if (baseCoord) {
      maskStore.setRunHitAnchor({
        stepIndex: baseIndex,
        stepName: `步骤 #${baseIndex + 1}`,
        x: baseCoord.x,
        y: baseCoord.y,
        width: (baseCoord as any).width || 60,
        height: (baseCoord as any).height || 24
      });
    }
  } else {
    maskStore.clearRunHitAnchor();
  }

  // 给予蒙版窗口短暂渲染时间，保证先在物理屏幕呈现蓝色虚线框
  await new Promise((r) => setTimeout(r, 40));

  let isSuccess = true;
  const targetPid = runningScript.value?.targetApp?.pid;
  const useCua = cuaDriver.isReady() && targetPid != null;
  if (stepIndex === 0) {
    logFn('info', useCua ? `驱动: cua-driver (pid=${targetPid})` : '驱动: 内置模拟器');
  }
  try {
    if (isTauriEnv() && !useCua) {
      const hasAccess = await invoke('check_accessibility');
      if (!hasAccess) {
        logFn('error', '⚠️ 缺少 macOS 辅助功能权限，无法执行鼠标操作！请在「系统设置 → 隐私与安全性 → 辅助功能」中授权 Glimpse。');
        await invoke('open_accessibility_panel');
        return false;
      }
    }
    if (action.type === 'click_position') {
      const btn = (action as any).button || (action as any).buttonType || (action as any).clickType || 'left';
      const btnText = btn === 'left' ? '左键点击' : btn === 'double' ? '双击' : '右键点击';
      let targetX = action.x;
      let targetY = action.y;

      if (action.regionScope?.baseType === 'step') {
        const baseIndex = action.regionScope.targetStepIndex ?? (stepIndex - 1);
        const baseCoord = executedStepCoordinates[baseIndex] || maskStore.getBaseMarker(baseIndex);
        if (baseCoord) {
          targetX = Math.round(baseCoord.x + (action.x || 0));
          targetY = Math.round(baseCoord.y + (action.y || 0));
        }
      } else {
        if (action.x <= maskStore.bounds.width + 50 && action.y <= maskStore.bounds.height + 50) {
          targetX = Math.round(maskStore.bounds.x + action.x);
          targetY = Math.round(maskStore.bounds.y + action.y);
        }
      }

      if (useCua) {
        try {
          await cuaDriver.click(targetPid!, targetX, targetY, btn);
        } catch (e: any) {
          logFn('warn', `cua-driver 点击失败 (${e.message})，回退到模拟器`, { actionId: action.id, stepIndex });
          if (isTauriEnv()) await invoke('click_position', { x: targetX, y: targetY, button: btn });
        }
      } else if (isTauriEnv()) {
        await invoke('click_position', { x: targetX, y: targetY, button: btn });
      } else {
        const ok = await sleepWithControl(200, controller);
        if (!ok) return false;
      }

      const renderOk = await sleepWithControl(180, controller);
      if (!renderOk) return false;

      executedStepCoordinates[stepIndex] = { x: targetX, y: targetY };
      logFn('success', `坐标 (${targetX}, ${targetY}) ${btnText}完成`, { actionId: action.id, stepIndex });
    } else if (action.type === 'click_text') {
      const textAct = action as ClickTextAction;
      const btn = (textAct as any).button || (textAct as any).buttonType || (textAct as any).clickType || 'left';
      logFn('info', `OCR 检索文字:「${textAct.targetText}」(超时: ${textAct.timeoutSeconds}s)`, { actionId: action.id, stepIndex });

      if (isTauriEnv()) {
        const wantAudit = !!(runningScript.value?.config.exportMarkdownReport);
        if (wantAudit) await ocrAuditLogger.captureBeforeOCR(stepIndex, action.name, textAct.targetText, roi, 'run');

        // OCR 定位（Rust Apple Vision）
        const res: any = await invoke('find_text_position', {
          targetText: textAct.targetText,
          isFuzzy: textAct.fuzzyMatch,
          roiX: roi.x,
          roiY: roi.y,
          roiW: roi.width,
          roiH: roi.height,
          timeoutSeconds: textAct.timeoutSeconds,
          ocrImageScale: action.ocrImageScale ?? 1.0
        });

        const isHit = !!(res && res.success);
        const hitX = isHit ? (res.x ?? Math.round(roi.x + roi.width / 2)) : undefined;
        const hitY = isHit ? (res.y ?? Math.round(roi.y + roi.height / 2)) : undefined;
        const finalX = isHit && hitX != null ? Math.round(hitX + textAct.offsetX) : undefined;
        const finalY = isHit && hitY != null ? Math.round(hitY + textAct.offsetY) : undefined;

        if (isHit && finalX != null && finalY != null) {
          if (useCua) {
            try {
              await cuaDriver.click(targetPid!, finalX, finalY, btn);
            } catch (e: any) {
              logFn('warn', `cua-driver 点击失败 (${e.message})，回退到模拟器`, { actionId: action.id, stepIndex });
              if (isTauriEnv()) await invoke('click_position', { x: finalX, y: finalY, button: btn });
            }
          } else {
            await invoke('click_position', { x: finalX, y: finalY, button: btn });
          }

          const renderOk = await sleepWithControl(180, controller);
          if (!renderOk) return false;

          executedStepCoordinates[stepIndex] = { x: finalX, y: finalY };
          maskStore.setBaseMarker(stepIndex, {
            stepIndex,
            stepName: action.name,
            type: action.type,
            x: finalX,
            y: finalY,
            width: res.width ?? 60,
            height: res.height ?? 24,
            targetText: textAct.targetText,
            roi
          });
          logFn('success', `OCR 点击完成:「${textAct.targetText}」(${finalX}, ${finalY})${useCua ? ' [cua-driver]' : ''}`, { actionId: action.id, stepIndex });
        } else {
          logFn('error', res?.message || `OCR 未在指定区域内找到「${textAct.targetText}」`, { actionId: action.id, stepIndex });
          const lastStep = ocrAuditLogger.getLastStepRecord();
          if (lastStep?.ocrCandidates?.length) {
            logFn('warn', `Vision 识别到: ${lastStep.ocrCandidates.join('、')}`, { actionId: action.id, stepIndex });
          }
          isSuccess = false;
        }

        if (wantAudit) {
          ocrAuditLogger.captureAfterOCR(stepIndex, isHit, {
            x: finalX, y: finalY, width: res?.width, height: res?.height, message: res?.message
          }).catch(() => {});
        }
      } else {
        const ok = await sleepWithControl(350, controller);
        if (!ok) return false;
        const simX = Math.round(roi.x + roi.width / 2);
        const simY = Math.round(roi.y + roi.height / 2);
        executedStepCoordinates[stepIndex] = { x: simX, y: simY };
        logFn('success', `[模拟] OCR 定位成功 (${simX}, ${simY})`, { actionId: action.id, stepIndex });
      }
    } else if (action.type === 'drag_line') {
      const act = action as DragLineAction;
      const duration = act.durationSeconds || 0.5;
      if (useCua) {
        try {
          await cuaDriver.drag(targetPid!, act.startX, act.startY, act.endX, act.endY);
        } catch (e: any) {
          logFn('warn', `cua-driver 拖拽失败 (${e.message})，回退到模拟器`, { actionId: action.id, stepIndex });
          if (isTauriEnv()) await invoke('drag_line', { x1: act.startX, y1: act.startY, x2: act.endX, y2: act.endY, durationSeconds: duration });
        }
      } else if (isTauriEnv()) {
        await invoke('drag_line', { x1: act.startX, y1: act.startY, x2: act.endX, y2: act.endY, durationSeconds: duration });
      } else {
        const ok = await sleepWithControl(duration * 1000, controller);
        if (!ok) return false;
      }
      executedStepCoordinates[stepIndex] = { x: act.endX, y: act.endY };
      logFn('success', `直线拖拽完成: 已到达 (${act.endX}, ${act.endY})${useCua ? ' [cua-driver]' : ''}`, { actionId: action.id, stepIndex });
    } else if (action.type === 'drag_curve') {
      const act = action as DragCurveAction;
      const duration = act.durationSeconds || 0.8;
      if (useCua) {
        try {
          await cuaDriver.drag(targetPid!, act.startX, act.startY, act.endX, act.endY);
        } catch (e: any) {
          logFn('warn', `cua-driver 曲线拖拽失败 (${e.message})，回退到模拟器`, { actionId: action.id, stepIndex });
          if (isTauriEnv()) await invoke('drag_curve', { x1: act.startX, y1: act.startY, controlX: act.controlX, controlY: act.controlY, x2: act.endX, y2: act.endY, durationSeconds: duration });
        }
      } else if (isTauriEnv()) {
        await invoke('drag_curve', { x1: act.startX, y1: act.startY, controlX: act.controlX, controlY: act.controlY, x2: act.endX, y2: act.endY, durationSeconds: duration });
      } else {
        const ok = await sleepWithControl(duration * 1000, controller);
        if (!ok) return false;
      }
      executedStepCoordinates[stepIndex] = { x: act.endX, y: act.endY };
      logFn('success', `曲线平滑拖拽完成: 已到达 (${act.endX}, ${act.endY})${useCua ? ' [cua-driver]' : ''}`, { actionId: action.id, stepIndex });
    } else if (action.type === 'scroll') {
      const act = action as ScrollAction;
      let scrollX = act.targetX ?? null;
      let scrollY = act.targetY ?? null;
      if (scrollX != null && scrollY != null) {
        scrollX = Math.round(maskStore.bounds.x + scrollX);
        scrollY = Math.round(maskStore.bounds.y + scrollY);
      }
      if (useCua && scrollX != null && scrollY != null) {
        try {
          await cuaDriver.scroll(targetPid!, scrollX, scrollY, act.direction, act.distance);
        } catch (e: any) {
          logFn('warn', `cua-driver 滚动失败 (${e.message})，回退到模拟器`, { actionId: action.id, stepIndex });
          if (isTauriEnv()) await invoke('scroll_wheel', { direction: act.direction, distance: act.distance, x: scrollX, y: scrollY });
        }
      } else if (isTauriEnv()) {
        await invoke('scroll_wheel', { direction: act.direction, distance: act.distance, x: scrollX, y: scrollY });
      } else {
        const ok = await sleepWithControl(300, controller);
        if (!ok) return false;
      }
      logFn('success', `滚轮滚动完成${useCua ? ' [cua-driver]' : ''}`, { actionId: action.id, stepIndex });
    } else if (action.type === 'delay') {
      const act = action as DelayAction;
      const waitTime = act.seconds || 1.0;
      const ok = await sleepWithControl(waitTime * 1000, controller);
      if (!ok) return false;
      logFn('success', `延时等待完成`, { actionId: action.id, stepIndex });
    } else if (action.type.startsWith('identify_')) {
      const act = action as any;
      if (isTauriEnv() && act.targetText?.trim()) {
        const wantAudit = !!(runningScript.value?.config.exportMarkdownReport);
        if (wantAudit) await ocrAuditLogger.captureBeforeOCR(stepIndex, action.name, act.targetText, roi, 'run');
        const res: any = await invoke('find_text_position', {
          targetText: act.targetText,
          isFuzzy: act.fuzzyMatch !== false,
          roiX: roi.x,
          roiY: roi.y,
          roiW: roi.width,
          roiH: roi.height,
          timeoutSeconds: act.timeoutSeconds || 3,
          ocrImageScale: action.ocrImageScale ?? 1.0
        });
        const isHit = !!(res && res.success);
        const hitX = isHit && res.x != null ? Math.round(res.x + (act.offsetX || 0)) : undefined;
        const hitY = isHit && res.y != null ? Math.round(res.y + (act.offsetY || 0)) : undefined;

        if (isHit && hitX != null && hitY != null) {
          executedStepCoordinates[stepIndex] = { x: hitX, y: hitY };
          maskStore.setBaseMarker(stepIndex, {
            stepIndex,
            stepName: action.name,
            type: action.type,
            x: hitX,
            y: hitY,
            width: res.width || 60,
            height: res.height || 24,
            targetText: act.targetText,
            roi
          });
          logFn('success', `识别命中「${act.targetText}」位置 (${hitX}, ${hitY})`, { actionId: action.id, stepIndex });
        } else {
          logFn('error', res?.message || `识别未找到「${act.targetText}」`, { actionId: action.id, stepIndex });
          const lastStep = ocrAuditLogger.getLastStepRecord();
          if (lastStep?.ocrCandidates?.length) {
            logFn('warn', `Vision 识别到: ${lastStep.ocrCandidates.join('、')}`, { actionId: action.id, stepIndex });
          }
          isSuccess = false;
        }

        if (wantAudit) {
          ocrAuditLogger.captureAfterOCR(stepIndex, isHit, {
            x: hitX, y: hitY, width: res?.width, height: res?.height, message: res?.message
          }).catch(() => {});
        }
      }
    } else {
      const ok = await sleepWithControl(250, controller);
      if (!ok) return false;
      logFn('success', `动作「${action.name}」已完成`, { actionId: action.id, stepIndex });
    }
  } catch (err: any) {
    logFn('error', `步骤执行异常: ${err?.message || '未知错误'}`, { actionId: action.id, stepIndex });
    isSuccess = false;
  }

  // 命中后在蒙版展示绿框
  if (executedStepCoordinates[stepIndex]) {
    const c = executedStepCoordinates[stepIndex];
    maskStore.setRunHitAnchor({
      stepIndex,
      stepName: action.name,
      x: c.x,
      y: c.y,
      width: 60,
      height: 24
    });
  }

  const rawWait = action.customWaitSeconds != null && !isNaN(action.customWaitSeconds)
    ? Number(action.customWaitSeconds)
    : globalWait;
  const speed = runningScript.value?.config.executionSpeed || getEditingScriptFn()?.config.executionSpeed || 1.0;
  const waitSeconds = Math.max(0.05, rawWait / speed);

  if (waitSeconds > 0) {
    const waitOk = await sleepWithControl(waitSeconds * 1000, controller);
    if (!waitOk) return false;
  }

  return isSuccess;
};

// 运行指定自动化脚本
export const runScript = async (script: AutomationScript) => {
  if (executionStatus.value === 'running' || executionStatus.value === 'stopped' || executionStatus.value === 'paused' || executionStatus.value === 'completed' || executionStatus.value === 'stopping') {
    logFn('warn', '当前已有任务正在执行或正在停止中，请稍候');
    return;
  }
  if (Date.now() - lastStopTimestamp < 2000) {
    logFn('warn', '操作过于频繁，请 2 秒后再试');
    return;
  }

  runningScript.value = script;
  executionStatus.value = 'running';
  currentStepIndex.value = -1;
  currentLoop.value = 0;

  if (isTauriEnv()) {
    invoke('reset_execution_abort').catch(() => {});
  }

  broadcastSyncFn('state_updated', {
    executionStatus: 'running',
    scriptTitle: script.title,
    currentStepIndex: -1,
    currentLoop: 0
  });

  await new Promise((r) => setTimeout(r, 30));
  await maskStore.setSelectingMode(false);
  await maskStore.setVisible(true);

  executionAbortController = { abort: false, pause: false };
  const controller = executionAbortController;

  const repeatTarget = script.config.repeatCount ?? 1;
  const isInfinite = repeatTarget === 0;
  const globalWait = script.config.defaultWaitSeconds ?? 1.0;
  const pauseOnFailure = script.config.pauseOnFailure ?? true;

  logFn('info', `▶ 开始执行脚本「${script.title}」(循环: ${isInfinite ? '无限' : repeatTarget + '次'})`);
  ocrAuditLogger.startSession(script.title, 'run');

  // 目标应用唤醒与尺寸管理
  if (script.targetApp) {
    const { pid, bundleId, appName, autoFocusOnRun, autoResizeOnRun, autoMoveOnRun, initialBounds } = script.targetApp;
    if (autoFocusOnRun !== false) {
      await activateTargetApp(script.targetApp);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (autoResizeOnRun !== false && initialBounds && initialBounds.width > 0 && initialBounds.height > 0) {
      await applyAppWindowBounds(pid, initialBounds, appName, bundleId, !!autoMoveOnRun);
      await new Promise((r) => setTimeout(r, 120));
    }
    await snapMaskToApp(script.targetApp);
    await new Promise((r) => setTimeout(r, 60));
  }

  const executedStepCoordinates: Record<number, { x: number; y: number }> = {};
  let loopCount = 0;

  while (!controller.abort) {
    loopCount++;
    currentLoop.value = loopCount;
    broadcastSyncFn('state_updated', { currentLoop: loopCount });
    logFn('info', `--- 进入第 ${loopCount} 轮循环 ---`);

    for (let i = 0; i < script.actions.length; i++) {
      if (controller.abort) break;
      while (controller.pause) {
        if (controller.abort) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      await new Promise((r) => setTimeout(r, 0));

      const action = script.actions[i];
      let stepSuccess = await executeSingleAction(action, i, globalWait, controller, executedStepCoordinates);

      // 每步自动重试
      const maxRetries = action.retryCount ?? 0;
      const retryWait = action.retryWaitSeconds ?? 1.0;
      let retryAttempt = 0;
      while (!stepSuccess && retryAttempt < maxRetries && !controller.abort) {
        retryAttempt++;
        logFn('warn', `步骤 #${i + 1} 失败，自动重试 (${retryAttempt}/${maxRetries})，等待 ${retryWait}s...`, { actionId: action.id, stepIndex: i });
        const waitOk = await sleepWithControl(retryWait * 1000, controller);
        if (!waitOk) break;
        stepSuccess = await executeSingleAction(action, i, globalWait, controller, executedStepCoordinates);
      }

      if (!stepSuccess && pauseOnFailure) {
        logFn('error', `步骤 #${i + 1} 执行失败${maxRetries > 0 ? `（已重试 ${retryAttempt} 次）` : ''}，已暂停脚本。恢复后将重试此步骤。`);
        executionStatus.value = 'paused';
        broadcastSyncFn('state_updated', { executionStatus: 'paused' });
        await nextTick();
        controller.pause = true;
        while (controller.pause) {
          if (controller.abort) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!controller.abort) {
          logFn('info', `▶ 重试步骤 #${i + 1}「${action.name}」...`);
          i--;
        }
      }
    }

    if (controller.abort) break;
    if (!isInfinite && loopCount >= repeatTarget) break;
  }

  if (controller.abort) {
    logFn('warn', `⏹ 脚本「${script.title}」已终止运行`);
  } else {
    executionStatus.value = 'completed';
    broadcastSyncFn('state_updated', { executionStatus: 'completed' });
    await nextTick();
    logFn('success', `✔ 脚本「${script.title}」全部执行完毕！共完成 ${loopCount} 轮循环`);
    if (script.config.exportMarkdownReport) {
      await ocrAuditLogger.finishSessionAndOpenReport('completed');
    }
  }

  setTimeout(() => {
    if (executionStatus.value === 'completed' || executionStatus.value === 'stopped') {
      executionStatus.value = 'idle';
      currentStepIndex.value = -1;
      runningScript.value = null;
      maskStore.clearRunHitAnchor();
      broadcastSyncFn('state_updated', { executionStatus: 'idle', currentStepIndex: -1 });
    }
  }, 1500);
};

export const pauseScript = async () => {
  if (executionStatus.value === 'running' && executionAbortController) {
    executionAbortController.pause = true;
    executionStatus.value = 'paused';
    broadcastSyncFn('state_updated', { executionStatus: 'paused' });
    await nextTick();
    logFn('warn', '⏸ 用户手动暂停了脚本运行');
  }
};

export const resumeScript = async () => {
  if (executionStatus.value === 'paused' && executionAbortController) {
    executionAbortController.pause = false;
    executionStatus.value = 'running';
    broadcastSyncFn('state_updated', { executionStatus: 'running' });
    await nextTick();
    logFn('info', '▶ 恢复脚本运行');
  }
};

export const stopScript = async () => {
  if (executionStatus.value !== 'running' && executionStatus.value !== 'paused') {
    return;
  }
  
  // ── ALL synchronous first ──
  executionStatus.value = 'stopping';
  broadcastSyncFn('state_updated', { executionStatus: 'stopping' });
  
  if (executionAbortController) {
    executionAbortController.abort = true;
    executionAbortController.pause = false;
  }
  
  maskStore.setSelectingMode(false);
  maskStore.cancelInteraction();
  
  // ── Now yield for UI render ──
  await nextTick();
  
  // ── Async cleanup ──
  if (isTauriEnv()) {
    invoke('request_execution_abort').catch(() => {});
  }
  
  executionStatus.value = 'stopped';
  lastStopTimestamp = Date.now();
  broadcastSyncFn('state_updated', { executionStatus: 'stopped' });
  logFn('warn', '⏹ 用户发出停止指令');
  
  if (runningScript.value?.config.exportMarkdownReport) {
    ocrAuditLogger.finishSessionAndOpenReport('stopped').catch(() => {});
  }
  
  setTimeout(() => {
    executionStatus.value = 'idle';
    currentStepIndex.value = -1;
    runningScript.value = null;
    broadcastSyncFn('state_updated', { executionStatus: 'idle', currentStepIndex: -1 });
  }, 500);
};
