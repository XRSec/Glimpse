import type { Component } from 'vue';
import {
  Crosshair,
  Type,
  ArrowUpRight,
  Spline,
  Mouse,
  PenTool,
  ExternalLink,
  Terminal,
  Eye,
  Clock
} from 'lucide-vue-next';
import type { ActionType, MouseButton, RegionScopeConfig } from '../types/script';

/**
 * 获取动作的默认中文标题
 */
export const getActionDefaultTitle = (type: ActionType): string => {
  switch (type) {
    case 'click_position': return '点击指定坐标';
    case 'click_image': return '点击图片';
    case 'click_text': return '点击文字 (OCR)';
    case 'click_color': return '点击颜色';
    case 'click_node': return '点击节点';
    case 'identify_text': case 'identify_image': case 'identify_color': case 'identify_node':
      return '纯识别定位';
    case 'drag_line': return '拖动直线';
    case 'drag_curve': return '拖动曲线';
    case 'scroll': return '鼠标滚动';
    case 'input_text': return '输入文本';
    case 'paste_clipboard': return '粘贴剪贴板';
    case 'clear_and_input': return '清空并输入';
    case 'open_app': return '打开应用';
    case 'open_url': return '打开网址';
    case 'open_file': return '打开文件';
    case 'run_shell': return '运行 Shell 脚本';
    case 'run_applescript': return '运行 AppleScript';
    case 'wait_text_appear': return '等待文字出现';
    case 'wait_text_disappear': return '等待文字消失';
    case 'save_screenshot': return '截图保存';
    case 'delay': return '延时等待';
    case 'condition': return '条件判断';
    default: return '动作操作';
  }
};

/**
 * 匹配动作对应的 Lucide 图标组件
 */
export const getActionIcon = (type: ActionType): Component => {
  switch (type) {
    case 'click_text': return Type;
    case 'drag_line': return ArrowUpRight;
    case 'drag_curve': return Spline;
    case 'scroll': return Mouse;
    case 'input_text':
    case 'clear_and_input': return PenTool;
    case 'open_app':
    case 'open_url': return ExternalLink;
    case 'run_shell':
    case 'run_applescript': return Terminal;
    case 'wait_text_appear':
    case 'wait_text_disappear': return Eye;
    case 'delay': return Clock;
    case 'click_position':
    default: return Crosshair;
  }
};

/**
 * 获取图标徽标背景与文字颜色 class
 */
export const getActionIconBadgeClass = (type: ActionType): string => {
  if (type === 'click_text') return 'bg-[#da7756]/15 text-[#da7756]';
  if (type === 'drag_line') return 'bg-emerald-500/15 text-emerald-400';
  if (type === 'drag_curve') return 'bg-purple-500/15 text-purple-400';
  if (type === 'scroll') return 'bg-cyan-500/15 text-cyan-400';
  if (type.startsWith('input_') || type === 'clear_and_input') return 'bg-rose-500/15 text-rose-400';
  return 'bg-[#da7756]/15 text-[#da7756]';
};

/**
 * 获取动作的大分类简短标签
 */
export const getActionCategoryLabel = (type: ActionType): string => {
  if (type.startsWith('click_')) return '点击';
  if (type.startsWith('identify_')) return '识别';
  if (type.startsWith('drag_') || type === 'scroll') return '拖动';
  if (type.startsWith('input_') || type === 'paste_clipboard' || type === 'clear_and_input') return '输入';
  if (type.startsWith('open_')) return '打开';
  if (type.startsWith('run_')) return '运行';
  if (type.startsWith('wait_') || type === 'save_screenshot') return '界面';
  return '高级';
};

/**
 * 获取鼠标按键标签
 */
export const getButtonLabel = (btn?: MouseButton): string => {
  switch (btn) {
    case 'left': return '左键';
    case 'double': return '双击';
    case 'right': return '右键';
    default: return '点击';
  }
};

/**
 * 获取折叠状态下的限制区域摘要标签
 */
export const getRegionScopeBadge = (scope?: RegionScopeConfig): string => {
  if (!scope) return '';
  const left = Number(scope.left) || 0;
  const right = Number(scope.right) || 0;
  const top = Number(scope.top) || 0;
  const bottom = Number(scope.bottom) || 0;

  const width = Math.abs(right - left);
  const height = Math.abs(bottom - top);

  if (scope.baseType === 'step') {
    const stepNum = (scope.targetStepIndex ?? 0) + 1;
    if (width > 0 && height > 0) {
      return `[基于步骤#${stepNum}: ${width}×${height}px]`;
    }
    return `[基于步骤#${stepNum}限制]`;
  }
  if (width > 0 && height > 0) {
    return `[限制: ${width}×${height}px]`;
  }
  return '';
};

