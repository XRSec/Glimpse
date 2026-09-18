/**
 * src/services/logger.ts - Glimpse 统一日志与全链路轨迹系统
 * 
 * 核心功能：
 * 1. 内存实时队列存储 (供 UI 实时展示)
 * 2. 跨窗口广播同步 (Main -> Mask Overlay)
 * 3. 持久化同步写入磁盘 (.glimpse_logs/glimpse.log)，供开发者与 AI 快速读取定位问题
 * 4. 控制台色彩分级打印
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from '../stores/maskStore';
import { addLog as storeAddLog } from '../stores/scriptStore';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export const recordLog = (
  level: LogLevel,
  message: string,
  extra?: { actionId?: string; actionName?: string; stepIndex?: number; details?: any }
) => {
  // 1. 同步到全局 scriptStore 内存日志流 (UI 呈现)
  storeAddLog(level, message, extra);

  // 2. 控制台格式化输出
  const prefix = `[Glimpse][${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, message, extra?.details ?? '');
  else if (level === 'warn') console.warn(prefix, message, extra?.details ?? '');
  else console.log(prefix, message, extra?.details ?? '');

  // 3. 持久化写入磁盘 .glimpse_logs/glimpse.log
  if (isTauriEnv()) {
    const detailStr = extra?.details
      ? ` | ${typeof extra.details === 'object' ? JSON.stringify(extra.details) : extra.details}`
      : '';
    invoke('write_app_log', {
      level,
      message: `${message}${detailStr}`
    }).catch(() => {});
  }
};

export const log = {
  info: (msg: string, details?: any) => recordLog('info', msg, { details }),
  success: (msg: string, details?: any) => recordLog('success', msg, { details }),
  warn: (msg: string, details?: any) => recordLog('warn', msg, { details }),
  error: (msg: string, details?: any) => recordLog('error', msg, { details })
};

export default log;
