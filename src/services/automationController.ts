/**
 * automationController.ts - Glimpse 自动化控制系统
 * 严格遵守 AGENTS.md 铁律：先画框后识别、定位无副作用、统一应用吸附、单文件不超过 600 行。
 */
import { invoke } from '@tauri-apps/api/core';
import { maskStore, isTauriEnv } from '../stores/maskStore';
import { log } from './logger';
import { ocrAuditLogger } from './ocrAuditLogger';
import type {
  ScriptAction,
  ClickPositionAction,
  DragLineAction,
  DragCurveAction,
  BaseStepMarker,
  TargetAppConfig
} from '../types/script';

// 1. 日志与基础类型
export interface LocateResult {
  success: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  roi: { x: number; y: number; width: number; height: number };
  message: string;
}

// 2. 目标应用置顶与自动吸附对齐 (与窗口尺寸管理定位按钮 100% 效果一致)
export const activateTargetApp = async (targetApp?: TargetAppConfig | {
  bundleId?: string; appName?: string; pid?: number; windowTitle?: string;
}) => {
  if (!targetApp || !isTauriEnv()) return;
  try {
    await invoke('activate_target_app', { pid: targetApp.pid, appName: targetApp.appName, bundleId: targetApp.bundleId });
    log.info(`已激活置顶目标应用「${targetApp.appName || targetApp.bundleId || ''}」`);
  } catch (e) {
    log.warn(`激活目标应用「${targetApp.appName || targetApp.bundleId || ''}」失败: ${e}`);
  }
};
export const activateTargetAppHelper = activateTargetApp;

/**
 * 确保桌面蒙版根据目标应用当前真实窗口位置精准贴合定位
 */
export const ensureMaskAlignedToTargetApp = async (targetApp?: TargetAppConfig, activateApp: boolean = true): Promise<boolean> => {
  if (!targetApp || !targetApp.appName) {
    await maskStore.setVisible(true);
    await maskStore.syncFromNative();
    return true;
  }
  if (targetApp.bundleId === 'com.apple.fullscreen') {
    await maskStore.setVisible(true);
    await maskStore.setFullscreen(true);
    return true;
  }
  if (activateApp) await activateTargetApp(targetApp);

  // 2. 动态探测 App 当前实际屏幕位置与窗口尺寸 (与「目标应用与窗口尺寸管理」定位 100% 完全相同策略)
  const storedBounds = targetApp.initialBounds;
  let snapX = storedBounds?.x ?? maskStore.bounds.x;
  let snapY = storedBounds?.y ?? maskStore.bounds.y;
  let snapW = storedBounds?.width ?? maskStore.bounds.width;
  let snapH = storedBounds?.height ?? maskStore.bounds.height;

  if (isTauriEnv()) {
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
          snapX = matched.x;
          snapY = matched.y;
          if (!snapW || snapW < 50) snapW = matched.width ?? 1318;
          if (!snapH || snapH < 50) snapH = matched.height ?? 852;
        }
      }
    } catch (e) {
      log.warn(`探测目标应用「${targetApp.appName}」位置失败，使用记录坐标: ${e}`);
    }
  }

  // 3. 统一策略：强制同步蒙版四维参数 (X, Y, Width, Height)，杜绝小框或尺寸错位
  await maskStore.setVisible(true);
  await maskStore.snapToBounds({
    x: Math.round(snapX),
    y: Math.round(snapY),
    width: Math.max(100, Math.round(snapW)),
    height: Math.max(100, Math.round(snapH))
  });
  log.success(`🎯 蒙版已精准对齐「${targetApp.appName}」(${snapX}, ${snapY})，尺寸 [${snapW}×${snapH}px]`);
  return true;
};

// =========================================================================
// 3. 区域推导系统与限制区域有效性判定
// =========================================================================

/**
 * 判断动作是否配置了真正有效的局部限制区域
 * （避免在用户全蒙版运行时多出一个莫名其妙的蓝色虚线框）
 */
export const hasCustomLimitRegion = (action: ScriptAction): boolean => {
  const scope = action.regionScope;
  if (!scope) return false;
  const legacyType = (scope as any).type as string | undefined;
  const bt = scope.baseType
    || (legacyType === 'limit' || legacyType === 'custom' ? 'mask' : undefined)
    || (legacyType === 'relative_step' || legacyType === 'step' ? 'step' : undefined);
  if (bt === 'step') return true;
  if (bt === 'mask') {
    const l = scope.left || 0;
    const r = scope.right || 0;
    const t = scope.top || 0;
    const b = scope.bottom || 0;
    const hasValue = l > 0 || r > 0 || t > 0 || b > 0;
    const hasValidBox = Math.abs(r - l) > 10 && Math.abs(b - t) > 10;
    return hasValue && hasValidBox;
  }
  return false;
};

export const deriveActionROI = (
  action: ScriptAction,
  stepIndex: number,
  executedStepCoordinates: Record<number, { x: number; y: number }> = {}
): { x: number; y: number; width: number; height: number; label?: string } => {
  return maskStore.calculateEffectiveROI(action, stepIndex, executedStepCoordinates);
};

// =========================================================================
// 4. 视觉检索子系统 (Vision Search: OCR / Position / Drag)
// =========================================================================

export const searchTargetInROI = async (
  action: ScriptAction,
  roi: { x: number; y: number; width: number; height: number },
  stepIndex: number = 0,
  executedStepCoordinates?: Record<number, { x: number; y: number }>
): Promise<LocateResult> => {
  if (isTauriEnv()) {
    await invoke('reset_execution_abort').catch(() => {});
  }
  const act = action as any;

  // Fallback to mask bounds if width/height is 0 or negative
  if (roi.width <= 0 || roi.height <= 0) {
    roi.x = maskStore.bounds.x;
    roi.y = maskStore.bounds.y;
    roi.width = maskStore.bounds.width;
    roi.height = maskStore.bounds.height;
  }

  // 4.1 OCR 文字检索 (click_text, identify_text, wait_text_*)
  if (
    action.type === 'click_text' ||
    action.type === 'identify_text' ||
    action.type === 'wait_text_appear' ||
    action.type === 'wait_text_disappear' ||
    act.targetText
  ) {
    const text = act.targetText?.trim();
    if (!text) {
      return { success: false, roi, message: `动作「${action.name}」未配置目标文字` };
    }

    if (!isTauriEnv()) {
      const mockX = Math.round(roi.x + roi.width / 2);
      const mockY = Math.round(roi.y + roi.height / 2);
      return {
        success: true, x: mockX, y: mockY, width: 60, height: 24, roi,
        message: `[预览环境] 模拟命中文字「${text}」(${mockX}, ${mockY})`
      };
    }

    try {
      const hasPerm = await invoke('check_screen_recording');
      if (!hasPerm) {
        await invoke('open_screen_recording_panel');
        const permErr = '⚠️ Glimpse 未获得 macOS「屏幕录制」权限！\n\n缺少该权限时，macOS 会把所有软件窗口内容全部隐藏（只能截到桌面壁纸）。\n\n已为你打开「系统设置 -> 隐私与安全性 -> 屏幕录制」，请在此界面勾选 Glimpse 并重启应用！';
        log.error(`❌ ${permErr}`);
        alert(permErr);
        return { success: false, roi, message: permErr };
      }

      // 审计诊断：OCR 识别前截取限制区域 (ROI)
      await ocrAuditLogger.captureBeforeOCR(stepIndex, action.name, text, roi);

      log.info(`🔍 Vision OCR 开始在限制范围 [${roi.x}, ${roi.y}, ${roi.width}×${roi.height}px] 内检索文字「${text}」...`);
      let res: any = await invoke('find_text_position', {
        targetText: text,
        isFuzzy: act.fuzzyMatch !== false,
        roiX: roi.x,
        roiY: roi.y,
        roiW: roi.width,
        roiH: roi.height,
        timeoutSeconds: act.timeoutSeconds || 2.5,
        ocrImageScale: act.ocrImageScale ?? 1.0
      });

      const isFound = !!(res && res.success && res.x != null && res.y != null);
      const finalX = isFound ? Math.round(res.x + (act.offsetX || 0)) : undefined;
      const finalY = isFound ? Math.round(res.y + (act.offsetY || 0)) : undefined;
      const w = res?.width || 60;
      const h = res?.height || 24;

      // 审计诊断：OCR 识别完成 (命中或未命中) 后截取限制区域画面
      await ocrAuditLogger.captureAfterOCR(stepIndex, isFound, {
        x: finalX,
        y: finalY,
        width: w,
        height: h,
        message: res?.message
      });

      if (isFound && finalX != null && finalY != null) {
        log.success(`✅ Vision OCR 成功命中「${text}」: (${finalX}, ${finalY}) [${w}×${h}px]`);
        return {
          success: true,
          x: finalX,
          y: finalY,
          width: w,
          height: h,
          roi,
          message: `Vision OCR 命中「${text}」: (${finalX}, ${finalY}) [${w}×${h}px]`
        };
      }

      const failMsg = res?.message || `在限制区域 [${roi.width}×${roi.height}px] 内未检测到文字「${text}」`;
      log.warn(`⚠️ ${failMsg}`);
      return { success: false, roi, message: failMsg };
    } catch (e: any) {
      log.error(`❌ OCR 探测异常: ${e?.message || e}`);
      return { success: false, roi, message: `OCR 探测异常: ${e?.message || e}` };
    }
  }

  // 4.2 坐标点击 (click_position)
  if (action.type === 'click_position') {
    const cp = action as ClickPositionAction;
    let targetX = cp.x;
    let targetY = cp.y;
    if (cp.regionScope?.baseType === 'step') {
      const baseIdx = cp.regionScope.targetStepIndex ?? (stepIndex - 1);
      const baseCoord = executedStepCoordinates?.[baseIdx] || maskStore.getBaseMarker(baseIdx);
      if (baseCoord) {
        targetX = Math.round(baseCoord.x + (cp.x || 0));
        targetY = Math.round(baseCoord.y + (cp.y || 0));
      }
    } else if (cp.x <= maskStore.bounds.width + 50 && cp.y <= maskStore.bounds.height + 50) {
      targetX = Math.round(maskStore.bounds.x + cp.x);
      targetY = Math.round(maskStore.bounds.y + cp.y);
    }
    return { success: true, x: targetX, y: targetY, width: 32, height: 32, roi, message: `获取坐标点 (${targetX}, ${targetY})` };
  }

  // 4.3 拖动起点 (drag_line, drag_curve)
  if (action.type === 'drag_line' || action.type === 'drag_curve') {
    const drag = action as DragLineAction | DragCurveAction;
    const sx = Math.round(maskStore.bounds.x + (drag.startX || 0));
    const sy = Math.round(maskStore.bounds.y + (drag.startY || 0));
    return { success: true, x: sx, y: sy, width: 32, height: 32, roi, message: `拖动起点 (${sx}, ${sy})` };
  }

  // 4.4 其他类型保底返回 ROI 中心点
  const centerX = Math.round(roi.x + roi.width / 2);
  const centerY = Math.round(roi.y + roi.height / 2);
  return { success: true, x: centerX, y: centerY, width: 32, height: 32, roi, message: `区域中心锚点 (${centerX}, ${centerY})` };
};

// =========================================================================
// 5. 【定位】控制子系统 (先画框，不点击，保持穿透即刻返回)
// =========================================================================

export const locateStepTarget = async (
  action: ScriptAction,
  stepIndex: number,
  targetApp?: any,
  allActions: ScriptAction[] = []
): Promise<LocateResult> => {
  log.info(`🎯 开始定位步骤 #${stepIndex + 1}「${action.name}」...`);

  // 第一步：根据目标应用尺寸管理定位效果，将蒙版对齐贴合至目标应用当前窗口
  await ensureMaskAlignedToTargetApp(targetApp);
  maskStore.clearRunHitAnchor();
  maskStore.clearBaseROI();
  maskStore.clearSearchROI();

  const executedStepCoordinates: Record<number, { x: number; y: number }> = {};

  // 情况 A：基于前序步骤命中点框定范围
  if (action.regionScope?.baseType === 'step') {
    const baseIdx = action.regionScope.targetStepIndex ?? (stepIndex - 1);
    if (baseIdx < 0 || baseIdx >= allActions.length) {
      const errMsg = `基准步骤 #${baseIdx + 1} 不存在，无法定位`;
      log.error(`❌ ${errMsg}`);
      return {
        success: false,
        roi: { x: maskStore.bounds.x, y: maskStore.bounds.y, width: maskStore.bounds.width, height: maskStore.bounds.height },
        message: errMsg
      };
    }

    const baseAction = allActions[baseIdx];

    // 第二步：绘制【基准步骤】自身的限制区域矩形 (作为条件限制框，常驻屏幕，第二条规则保证不被取消)
    const baseRoi = deriveActionROI(baseAction, baseIdx, {});
    if (hasCustomLimitRegion(baseAction)) {
      maskStore.setBaseROI({
        ...baseRoi,
        label: `基准步骤 #${baseIdx + 1}「${baseAction.name}」限制区域: ${baseRoi.width}×${baseRoi.height}px`
      });
    } else {
      maskStore.clearBaseROI();
    }

    // 第三步：在目标矩形内 OCR 寻找基准步骤
    const baseRes = await searchTargetInROI(baseAction, baseRoi);

    // 如果找不到：基准限制矩形常驻屏幕，严禁清除，明确报错
    if (!baseRes.success || baseRes.x == null || baseRes.y == null) {
      const targetTxt = (baseAction as any).targetText ? `文字「${(baseAction as any).targetText}」` : '目标';
      const failMsg = `未在基准步骤 #${baseIdx + 1}「${baseAction.name}」的限制区域 [${baseRoi.width}×${baseRoi.height}px] 内检测到${targetTxt}，检索框已常驻屏幕供核验`;
      log.error(`❌ ${failMsg}`);
      return { success: false, roi: baseRoi, message: failMsg };
    }

    // 如果找到：第一件事立即用绿色矩形+中心准星在蒙版上渲染基准命中位置
    const baseMarker: BaseStepMarker = {
      stepIndex: baseIdx,
      stepName: baseAction.name,
      type: baseAction.type,
      x: baseRes.x,
      y: baseRes.y,
      width: baseRes.width || 60,
      height: baseRes.height || 24,
      targetText: (baseAction as any).targetText,
      roi: baseRoi
    };
    maskStore.setBaseMarker(baseIdx, baseMarker);
    maskStore.setRunHitAnchor({
      stepIndex: baseIdx,
      stepName: `基准 #${baseIdx + 1}: ${baseAction.name}`,
      x: baseRes.x,
      y: baseRes.y,
      width: baseRes.width || 60,
      height: baseRes.height || 24
    });
    executedStepCoordinates[baseIdx] = { x: baseRes.x, y: baseRes.y };

    // 核心：基准条件限制框 baseROI 常驻屏幕，绝对不被取消！
    // 定位基准步骤只标定基准准星与基准限制框，不提前绘制当前步骤的多余记录，实现单纯定位
    maskStore.clearSearchROI();
    maskStore.mode.value = 'none';
    maskStore.setSelectingMode(false);

    log.success(`🎯 定位成功: 已标定基准步骤 #${baseIdx + 1} 命中点 (${baseRes.x}, ${baseRes.y})`);
    return {
      success: true,
      x: baseRes.x,
      y: baseRes.y,
      roi: baseRoi,
      message: `定位成功: 已标定基准 #${baseIdx + 1} 命中点 (${baseRes.x}, ${baseRes.y})`
    };
  } else {
    // 情况 B：基于蒙版本身限制 (仅当配置了真正的有效局部限制时才画框，否则绝不画多余蓝框)
    maskStore.clearBaseROI();
    if (hasCustomLimitRegion(action)) {
      const roi = deriveActionROI(action, stepIndex, executedStepCoordinates);
      maskStore.setSearchROI(roi);
      log.success(`🎯 已在蒙版标定步骤 #${stepIndex + 1} 限制区域 [${roi.width}×${roi.height}px]`);
      return { success: true, roi, message: `定位成功: 已标定限制区域 (${roi.width}×${roi.height}px)` };
    } else {
      maskStore.clearSearchROI();
      const fullRoi = { x: maskStore.bounds.x, y: maskStore.bounds.y, width: maskStore.bounds.width, height: maskStore.bounds.height };
      log.success(`🎯 步骤 #${stepIndex + 1} 为全蒙版识别，无需绘制局部虚线框`);
      return { success: true, roi: fullRoi, message: `步骤 #${stepIndex + 1} 使用全蒙版区域识别` };
    }
  }
};

// =========================================================================
// 6. 【测试 / 执行】控制子系统 (先画框，后识别，命中后画绿框再派发硬件)
// =========================================================================

export const testStepTarget = async (
  action: ScriptAction,
  stepIndex: number,
  targetApp?: any,
  allActions: ScriptAction[] = [],
  executeHardwareActionFn?: (
    action: ScriptAction,
    stepIndex: number,
    coords: Record<number, { x: number; y: number }>
  ) => Promise<boolean>
): Promise<{ success: boolean; message: string; x?: number; y?: number }> => {
  if (isTauriEnv()) {
    await invoke('reset_execution_abort').catch(() => {});
  }
  log.info(`🧪 开始测试单步 #${stepIndex + 1}「${action.name}」...`);
  ocrAuditLogger.startSession(`步骤 #${stepIndex + 1}「${action.name}」`, 'test');

  // 第 1 步：先自动将蒙版对齐贴合至目标应用当前窗口，重置旧交互状态
  await ensureMaskAlignedToTargetApp(targetApp);
  maskStore.clearRunHitAnchor();
  maskStore.clearBaseROI();
  maskStore.clearSearchROI();
  maskStore.context.value = { mode: 'none' };
  maskStore.mode.value = 'none';
  maskStore.broadcastMaskSync('mask_interaction_cancel');
  await maskStore.setSelectingMode(false);

  const executedStepCoordinates: Record<number, { x: number; y: number }> = {};
  let roi: { x: number; y: number; width: number; height: number; label?: string } = {
    x: maskStore.bounds.x,
    y: maskStore.bounds.y,
    width: maskStore.bounds.width,
    height: maskStore.bounds.height,
    label: '蒙版全域'
  };

  // 第 2 步：计算并先绘制【本地识别 限制区域】数据的矩形
  if (action.regionScope?.baseType === 'step') {
    const baseIdx = action.regionScope.targetStepIndex ?? (stepIndex - 1);
    const cachedMarker = maskStore.getBaseMarker(baseIdx);

    if (cachedMarker && cachedMarker.x != null && cachedMarker.y != null) {
      executedStepCoordinates[baseIdx] = { x: cachedMarker.x, y: cachedMarker.y };
      maskStore.setRunHitAnchor({
        stepIndex: baseIdx,
        stepName: `基准 #${baseIdx + 1}: ${cachedMarker.stepName}`,
        x: cachedMarker.x,
        y: cachedMarker.y,
        width: cachedMarker.width || 60,
        height: cachedMarker.height || 24
      });
      if (cachedMarker.roi) {
        maskStore.setBaseROI({
          ...cachedMarker.roi,
          label: `基准步骤 #${baseIdx + 1} 限制区域: ${cachedMarker.roi.width}×${cachedMarker.roi.height}px`
        });
      }
      roi = deriveActionROI(action, stepIndex, executedStepCoordinates);
      maskStore.setSearchROI(roi);
    } else {
      if (baseIdx < allActions.length) {
        const baseAction = allActions[baseIdx];
        const baseRoi = deriveActionROI(baseAction, baseIdx, {});
        if (hasCustomLimitRegion(baseAction)) {
          maskStore.setBaseROI({
            ...baseRoi,
            label: `基准步骤 #${baseIdx + 1} 限制区域: ${baseRoi.width}×${baseRoi.height}px`
          });
        }
        await new Promise((r) => setTimeout(r, 120));

        const baseRes = await searchTargetInROI(baseAction, baseRoi);
        if (baseRes.success && baseRes.x != null && baseRes.y != null) {
          executedStepCoordinates[baseIdx] = { x: baseRes.x, y: baseRes.y };
          maskStore.setBaseMarker(baseIdx, {
            stepIndex: baseIdx,
            stepName: baseAction.name,
            type: baseAction.type,
            x: baseRes.x,
            y: baseRes.y,
            width: baseRes.width || 60,
            height: baseRes.height || 24,
            targetText: (baseAction as any).targetText,
            roi: baseRoi
          });
          maskStore.setRunHitAnchor({
            stepIndex: baseIdx,
            stepName: `基准 #${baseIdx + 1}: ${baseAction.name}`,
            x: baseRes.x,
            y: baseRes.y,
            width: baseRes.width || 60,
            height: baseRes.height || 24
          });
          roi = deriveActionROI(action, stepIndex, executedStepCoordinates);
          maskStore.setSearchROI(roi);
        } else {
          const err = `未能找到基准步骤 #${baseIdx + 1}「${baseAction.name}」，无法推导限制区域`;
          log.error(`❌ ${err}`);
          return { success: false, message: err };
        }
      }
    }
  } else {
    // 基于蒙版：仅当配置了局部限制时才画蓝色虚线框，否则清空不画多余框
    const scope = action.regionScope;
    roi = deriveActionROI(action, stepIndex, {});
    if (hasCustomLimitRegion(action)) {
      maskStore.setSearchROI(roi);
    } else {
      maskStore.clearSearchROI();
    }
  }

  // 等待 120ms 渲染刷新，让限制区域真真切切在屏幕上展现
  await new Promise((r) => setTimeout(r, 120));

  // 第 4 步：在限制区域截屏内调用 OCR / 图像识别
  const searchRes = await searchTargetInROI(action, roi, stepIndex, executedStepCoordinates);

  // 第 5 步：未命中处理（限制框常驻屏幕，严禁清除）
  if (!searchRes.success || searchRes.x == null || searchRes.y == null) {
    const actText = (action as any).targetText ? `文字「${(action as any).targetText}」` : '目标';
    const err = searchRes.message || `在限制区域 [${roi.width}×${roi.height}px] 内未检测到${actText}`;
    log.error(`❌ 步骤 #${stepIndex + 1}「${action.name}」测试未通过: ${err}`);
    await ocrAuditLogger.finishSessionAndOpenReport('failed');
    return { success: false, message: err };
  }

  // 命中处理：立即更新命中点并在蒙版上绘制绿色高亮方框+准星
  executedStepCoordinates[stepIndex] = { x: searchRes.x, y: searchRes.y };
  maskStore.setBaseMarker(stepIndex, {
    stepIndex,
    stepName: action.name,
    type: action.type,
    x: searchRes.x,
    y: searchRes.y,
    width: searchRes.width || 60,
    height: searchRes.height || 24,
    targetText: (action as any).targetText,
    roi: searchRes.roi
  });

  maskStore.setRunHitAnchor({
    stepIndex,
    stepName: action.name,
    x: searchRes.x,
    y: searchRes.y,
    width: searchRes.width || 60,
    height: searchRes.height || 24
  });

  // 停留 300ms 视觉驻留帧，让用户清晰看到锁定目标
  await new Promise((r) => setTimeout(r, 300));

  // 纯识别动作无需派发硬件操作，直接成功返回
  if (action.type.startsWith('identify_')) {
    const okMsg = `步骤 #${stepIndex + 1}「${action.name}」纯识别通过！命中坐标 (${searchRes.x}, ${searchRes.y})`;
    log.success(`🧪 ${okMsg}`);
    await ocrAuditLogger.finishSessionAndOpenReport('completed');
    return { success: true, message: okMsg, x: searchRes.x, y: searchRes.y };
  }

  // 第 6 步：执行真实操作并处理延时等待
  if (executeHardwareActionFn) {
    try {
      const ok = await executeHardwareActionFn(action, stepIndex, executedStepCoordinates);
      if (ok) {
        await handleStepDelay(action);
        const okMsg = `步骤 #${stepIndex + 1}「${action.name}」测试通过！已执行操作`;
        log.success(`🧪 ${okMsg}`);
        await ocrAuditLogger.finishSessionAndOpenReport('completed');
        return { success: true, message: okMsg, x: searchRes.x, y: searchRes.y };
      }
    } catch (e: any) {
      log.error(`❌ 硬件操作派发失败: ${e?.message || e}`);
      await ocrAuditLogger.finishSessionAndOpenReport('failed');
      return { success: false, message: `硬件操作派发失败: ${e?.message || e}` };
    }
  }

  // 默认硬件派发：按配置的按键类型 (left/right/double) 调用原生点击
  if (isTauriEnv()) {
    try {
      const hasAccess = await invoke('check_accessibility');
      if (!hasAccess) {
        await invoke('open_accessibility_panel');
        const errMsg = '⚠️ Glimpse 未获得 macOS「辅助功能」权限！\n\n缺少该权限时，Glimpse 无法控制鼠标点击。\n\n已为你打开「系统设置 -> 隐私与安全性 -> 辅助功能」，请勾选 Glimpse 并重启应用！';
        log.error(`❌ ${errMsg}`);
        alert(errMsg);
        await ocrAuditLogger.finishSessionAndOpenReport('failed');
        return { success: false, message: errMsg };
      }
    } catch (e) {}
    try {
      if (action.type === 'click_text' || action.type === 'click_position' || action.type.startsWith('click_')) {
        const btn = (action as any).button || (action as any).buttonType || (action as any).clickType || 'left';
        log.info(`🖱️ 派发原生点击: 坐标 (${searchRes.x}, ${searchRes.y})，按键: ${btn}`);
        await invoke('click_position', { x: searchRes.x, y: searchRes.y, button: btn });
      } else if (action.type === 'send_key') {
        const keyStr = ((action as any).key || '').trim();
        const repeat = Number((action as any).repeat) || 1;
        if (!keyStr) {
          return { success: false, message: '未配置目标按键' };
        }
        log.info(`⌨️ 派发原生按键: 「${keyStr}」 (×${repeat})`);
        await invoke('send_key', { key: keyStr, repeat });
      }
    } catch (e: any) {
      log.error(`❌ 硬件点击失败: ${e?.message || e}`);
      await ocrAuditLogger.finishSessionAndOpenReport('failed');
      return { success: false, message: `硬件点击失败: ${e?.message || e}` };
    }
  }

  // 处理动作配置的等待延时（例如：等 0.3s）
  await handleStepDelay(action);

  const okMsg = `步骤 #${stepIndex + 1}「${action.name}」测试通过！命中点 (${searchRes.x}, ${searchRes.y})`;
  log.success(`🧪 ${okMsg}`);
  await ocrAuditLogger.finishSessionAndOpenReport('completed');
  return { success: true, message: okMsg, x: searchRes.x, y: searchRes.y };
};

const handleStepDelay = async (action: ScriptAction) => {
  const act = action as any;
  const delaySec = action.customWaitSeconds ?? act.delaySeconds ?? act.seconds;
  if (delaySec != null && !isNaN(Number(delaySec)) && Number(delaySec) > 0) {
    const ms = Math.round(Number(delaySec) * 1000);
    log.info(`⏳ 动作完成，执行等待 ${delaySec}s (${ms}ms)...`);
    await new Promise((r) => setTimeout(r, ms));
  }
};

// =========================================================================
// 7. 聚合导出系统
// =========================================================================

export const automationController = {
  activateTargetApp,
  activateTargetAppHelper,
  ensureMaskAlignedToTargetApp,
  hasCustomLimitRegion,
  deriveActionROI,
  searchTargetInROI,
  locateStepTarget,
  testStepTarget,
  setLogger: (_fn: (level: any, msg: any, details?: any) => void) => {}
};

export default automationController;
