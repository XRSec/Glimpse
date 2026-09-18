/**
 * ocrAuditLogger.ts - Glimpse OCR 运行审计与可视化诊断系统
 * 
 * 功能职责：
 * 1. 每次点击运行 / 单步测试，在 OCR 识别检索前将限制区域 (ROI) 截屏保存至 /tmp/glimpse_audit/...
 * 2. 检索命中 (或未命中) 后，将识别区域画面再次截屏保存，形成时序前后对比。
 * 3. 运行或测试结束/停止时，生成结构化 Markdown 诊断报告并自动唤起系统默认应用打开。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from '../stores/maskStore';
import { log } from './logger';

export interface AuditStepRecord {
  stepIndex: number;
  actionName: string;
  targetText: string;
  roi: { x: number; y: number; width: number; height: number };
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success?: boolean;
  hitX?: number;
  hitY?: number;
  hitWidth?: number;
  hitHeight?: number;
  beforeImagePath?: string;
  afterImagePath?: string;
  message?: string;
  ocrCandidates?: string[];
}

export interface AuditSession {
  sessionId: string;
  title: string;
  mode: 'run' | 'test';
  sessionDir: string;
  startTime: number;
  endTime?: number;
  steps: AuditStepRecord[];
  activeStep?: AuditStepRecord;
}

class OCRAuditLogger {
  private currentSession: AuditSession | null = null;

  /**
   * 开启新的审计诊断会话
   */
  public startSession(title: string, mode: 'run' | 'test' = 'run') {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const sessionId = `audit_${timeStr}`;
    const sessionDir = `/tmp/glimpse_audit/${sessionId}`;

    this.currentSession = {
      sessionId,
      title: title || (mode === 'test' ? '单步测试' : '自动化脚本运行'),
      mode,
      sessionDir,
      startTime: Date.now(),
      steps: []
    };

    log.info(`📊 [OCR 审计] 启动诊断会话: ${sessionId} (目录: ${sessionDir})`);
  }

  /**
   * 获取或初始化当前会话
   */
  private ensureSession(defaultTitle: string = '自动化运行', mode: 'run' | 'test' = 'run'): AuditSession {
    if (!this.currentSession) {
      this.startSession(defaultTitle, mode);
    }
    return this.currentSession!;
  }

  /**
   * OCR 检索前截取限制区域 (ROI)
   */
  public async captureBeforeOCR(
    stepIndex: number,
    actionName: string,
    targetText: string,
    roi: { x: number; y: number; width: number; height: number },
    mode: 'run' | 'test' = 'run'
  ): Promise<string | undefined> {
    const session = this.ensureSession(actionName, mode);
    const imgFilename = `step_${stepIndex + 1}_before_search.png`;
    const imagePath = `${session.sessionDir}/${imgFilename}`;

    const record: AuditStepRecord = {
      stepIndex,
      actionName,
      targetText,
      roi: { ...roi },
      startTime: Date.now(),
      beforeImagePath: imagePath
    };
    session.activeStep = record;

    if (isTauriEnv()) {
      try {
        await invoke('capture_screen_roi', {
          x: roi.x,
          y: roi.y,
          width: roi.width,
          height: roi.height,
          filePath: imagePath
        });
        log.info(`📸 [OCR 审计] 已截取检索前限制区域图 -> ${imagePath}`);
      } catch (e) {
        log.warn(`⚠️ [OCR 审计] 截取检索前限制区域失败: ${e}`);
      }
    }

    return imagePath;
  }

  /**
   * OCR 检索完成 (找到或未找到) 后再次截取限制区域 (ROI)
   */
  public async captureAfterOCR(
    stepIndex: number,
    success: boolean,
    resultData: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      message?: string;
    }
  ): Promise<string | undefined> {
    if (!this.currentSession || !this.currentSession.activeStep) {
      return undefined;
    }

    const session = this.currentSession;
    const record = session.activeStep!;
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.success = success;
    record.hitX = resultData.x;
    record.hitY = resultData.y;
    record.hitWidth = resultData.width;
    record.hitHeight = resultData.height;
    record.message = resultData.message;

    const suffix = success ? 'after_hit' : 'not_found';
    const imgFilename = `step_${stepIndex + 1}_${suffix}.png`;
    const imagePath = `${session.sessionDir}/${imgFilename}`;
    record.afterImagePath = imagePath;

    if (isTauriEnv()) {
      try {
        await invoke('capture_screen_roi', {
          x: record.roi.x,
          y: record.roi.y,
          width: record.roi.width,
          height: record.roi.height,
          filePath: imagePath
        });
        log.info(`📸 [OCR 审计] 已截取${success ? '命中后' : '未命中'}限制区域图 -> ${imagePath}`);
      } catch (e) {
        log.warn(`⚠️ [OCR 审计] 截取识别后限制区域失败: ${e}`);
      }
    }

    // 失败时读取 OCR 引擎实际识别到的所有候选文字
    if (!success && isTauriEnv()) {
      try {
        const content: string = await invoke('read_text_file', { path: '/tmp/glimpse_ocr_candidates.txt' });
        if (content && content.trim().length > 0) {
          record.ocrCandidates = content.trim().split('\n');
        }
      } catch (_) {
        // 文件不存在或读取失败，忽略
      }
    }

    // 归档该步骤
    session.steps.push(record);
    session.activeStep = undefined;

    return imagePath;
  }

  /**
   * 获取最近一次完成的步骤记录（用于读取 ocrCandidates）
   */
  public getLastStepRecord(): AuditStepRecord | undefined {
    if (!this.currentSession || this.currentSession.steps.length === 0) return undefined;
    return this.currentSession.steps[this.currentSession.steps.length - 1];
  }

  /**
   * 停止运行 / 完成执行后，汇总输出 Markdown 并自动在系统应用中打开
   */
  public async finishSessionAndOpenReport(status: 'completed' | 'stopped' | 'failed' = 'completed'): Promise<void> {
    if (!this.currentSession || this.currentSession.steps.length === 0) {
      log.info(`📊 [OCR 审计] 无待输出的 OCR 审计步骤`);
      this.currentSession = null;
      return;
    }

    const session = this.currentSession;
    session.endTime = Date.now();
    const totalDuration = ((session.endTime - session.startTime) / 1000).toFixed(2);
    const totalSteps = session.steps.length;
    const successCount = session.steps.filter((s) => s.success).length;

    const statusBadge =
      status === 'completed' ? '🟢 全部完成' : status === 'stopped' ? '🟡 用户终止' : '🔴 异常中断';

    const dateStr = new Date(session.startTime).toLocaleString('zh-CN', { hour12: false });

    // 构造结构化 Markdown 报告
    const mdLines: string[] = [
      `# 📋 Glimpse OCR 自动化运行诊断报告`,
      ``,
      `> 自动生成时间：${dateStr} | 会话 ID：\`${session.sessionId}\``,
      ``,
      `## 1. 运行概要`,
      `- **脚本名称 / 主题**：${session.title}`,
      `- **执行模式**：${session.mode === 'test' ? '🧪 单步精准测试' : '▶️ 全局脚本运行'}`,
      `- **执行状态**：${statusBadge}`,
      `- **总耗时**：${totalDuration} 秒`,
      `- **OCR 检索统计**：共 \`${totalSteps}\` 次检索，成功 \`${successCount}\` 次，失败 \`${totalSteps - successCount}\` 次`,
      `- **数据归档目录**：\`${session.sessionDir}\``,
      ``,
      `---`,
      ``,
      `## 2. OCR 检索步骤明细与视觉对比`,
      ``
    ];

    session.steps.forEach((step, idx) => {
      const stepStatus = step.success ? '✅ 命中成功' : '❌ 未找到目标';
      const beforeName = `step_${step.stepIndex + 1}_before_search.png`;
      const afterName = step.success
        ? `step_${step.stepIndex + 1}_after_hit.png`
        : `step_${step.stepIndex + 1}_not_found.png`;

      mdLines.push(`### 步骤 #${step.stepIndex + 1}：${step.actionName}`);
      mdLines.push(`- **目标文字**：\`${step.targetText}\``);
      mdLines.push(`- **限制区域 (ROI)**：[X: ${step.roi.x}, Y: ${step.roi.y}, 宽: ${step.roi.width}px, 高: ${step.roi.height}px]`);
      mdLines.push(`- **检索状态**：${stepStatus}`);
      mdLines.push(`- **识别耗时**：${step.durationMs ?? 0} ms`);
      if (step.success && step.hitX != null && step.hitY != null) {
        mdLines.push(`- **命中绝对坐标**：\`(${step.hitX}, ${step.hitY})\` (文字范围: ${step.hitWidth ?? 60}×${step.hitHeight ?? 24}px)`);
      }
      if (step.message) {
        mdLines.push(`- **执行详情**：${step.message}`);
      }
      if (!step.success && step.ocrCandidates && step.ocrCandidates.length > 0) {
        mdLines.push(`- **Vision 实际识别到的文字**：`);
        step.ocrCandidates.forEach((text, i) => {
          mdLines.push(`  ${i + 1}. \`${text}\``);
        });
      } else if (!step.success && (!step.ocrCandidates || step.ocrCandidates.length === 0)) {
        mdLines.push(`- **Vision 实际识别到的文字**：（无，OCR 引擎未识别到任何文字）`);
      }
      mdLines.push(``);
      mdLines.push(`#### 📷 区域时序对比`);
      mdLines.push(``);
      mdLines.push(`| 🔍 检索前限制区域画面 (Before Search) | 🎯 识别命中后限制区域画面 (After Hit) |`);
      mdLines.push(`| :---: | :---: |`);
      mdLines.push(`| ![检索前](./${beforeName}) | ![识别后](./${afterName}) |`);
      mdLines.push(``);
      mdLines.push(`---`);
      mdLines.push(``);
    });

    mdLines.push(`## 3. 诊断分析提示`);
    mdLines.push(`- **若检索前图片中已存在目标文字但未识别**：请检查是否文字存在旋转、半透明或者由于高分屏 Retina 缩放导致文字过于微小。`);
    mdLines.push(`- **若检索前图片中目标文字尚未渲染完成**：说明前序操作（如鼠标右键或点击）后缺少适当延时，建议在前序动作配置 0.3s~0.5s 延时。`);
    mdLines.push(`- **若命中后图片中菜单弹窗出现抖动或消失**：请检查目标应用是否受到焦点争抢，或确认是否有冗余鼠标移动事件导致菜单收起。`);
    mdLines.push(``);

    const markdownContent = mdLines.join('\n');
    const reportPath = `${session.sessionDir}/audit_report.md`;

    if (isTauriEnv()) {
      try {
        await invoke('save_and_open_markdown_report', {
          filePath: reportPath,
          content: markdownContent
        });
        log.success(`📄 [OCR 审计] 诊断报告已生成并打开: ${reportPath}`);
      } catch (e) {
        log.warn(`⚠️ [OCR 审计] 保存或打开 Markdown 报告失败: ${e}`);
      }
    } else {
      console.log('--- OCR AUDIT MARKDOWN REPORT ---');
      console.log(markdownContent);
    }

    this.currentSession = null;
  }
}

export const ocrAuditLogger = new OCRAuditLogger();
export default ocrAuditLogger;
