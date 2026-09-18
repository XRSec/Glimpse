// 动作分类
export type ActionCategory =
  | 'click'      // 点击
  | 'drag'       // 拖动
  | 'input'      // 输入
  | 'open'       // 打开
  | 'run'        // 运行
  | 'ui'         // 界面
  | 'advanced';  // 高级

// 完整动作类型定义，对应截图的两级级联菜单
export type ActionType =
  // 1. 点击系列
  | 'click_position'   // 点击坐标
  | 'click_image'      // 点击图片
  | 'click_text'       // 点击文字 (Apple 原生 Vision OCR)
  | 'click_color'      // 点击颜色
  | 'click_node'       // 点击节点
  | 'ai_click'         // AI点击
  // 2. 拖动系列
  | 'drag_line'        // 拖动直线 (从起点拖到终点直线)
  | 'drag_curve'       // 拖动曲线 (沿贝塞尔/平滑拟人轨迹拖动)
  | 'scroll'           // 滚动 (鼠标滚轮滚动：上滚、下滚、指定距离)
  // 3. 输入系列
  | 'input_text'       // 输入文本
  | 'paste_clipboard'  // 粘贴剪贴板
  | 'clear_and_input'  // 清空并输入
  // 4. 打开系列
  | 'open_app'         // 打开应用
  | 'open_url'         // 打开网址
  | 'open_file'        // 打开文件
  // 5. 运行系列
  | 'run_shell'        // 运行 Shell 脚本
  | 'run_applescript'  // 运行 AppleScript
  // 6. 界面系列
  | 'wait_text_appear' // 等待文字出现
  | 'wait_text_disappear' // 等待文字消失
  | 'save_screenshot'  // 截图保存
  // 7. 高级系列
  | 'delay'            // 延时等待
  | 'condition';       // 条件判断

// 鼠标按键类型：左键、双击、右键
export type MouseButton = 'left' | 'double' | 'right';

// 识别区域基准类型：'mask'（基于脚本运行蒙版）或 'step'（基于某个步骤的点击位置）
export type RegionBaseType = 'mask' | 'step';
export type RegionScopeType = 'limit' | 'mask' | 'relative_step' | 'custom' | 'fullscreen' | 'step';

// 限制区域字段定义
export interface RegionLimit {
  left: number;
  right: number;
  top: number;
  bottom: number;
  unit: '%' | 'px';
}

// 限制识别区域配置 (使用纯像素数值 px，而不是百分比，并支持基于谁限制)
export interface RegionScopeConfig {
  baseType?: RegionBaseType;
  type?: RegionScopeType;
  targetStepIndex?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  unit?: '%' | 'px';
  relX1?: number;
  relX2?: number;
  relY1?: number;
  relY2?: number;
  customX1?: number;
  customX2?: number;
  customY1?: number;
  customY2?: number;
}

// 基础动作模型
export interface BaseAction {
  id: string;
  name: string;
  type: ActionType;
  isEnabled: boolean;
  isExpanded: boolean;
  customWaitSeconds?: number | null;
  recognizeMode?: 'local' | 'cloud';
  regionScope?: RegionScopeConfig;
}

// 1. 点击坐标动作
export interface ClickPositionAction extends BaseAction {
  type: 'click_position';
  x: number;
  y: number;
  button: MouseButton;
}

// 2. 点击文字动作 (OCR 核心)
export interface ClickTextAction extends BaseAction {
  type: 'click_text';
  targetText: string;
  fuzzyMatch: boolean;
  offsetX: number;
  offsetY: number;
  timeoutSeconds: number;
  button: MouseButton;
}

// 3. 拖动直线动作
export interface DragLineAction extends BaseAction {
  type: 'drag_line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationSeconds: number;
}

// 4. 拖动曲线动作
export interface DragCurveAction extends BaseAction {
  type: 'drag_curve';
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  durationSeconds: number;
}

// 5. 滚动动作
export interface ScrollAction extends BaseAction {
  type: 'scroll';
  direction: 'up' | 'down';
  distance: number;
  targetX?: number;
  targetY?: number;
}

// 6. 输入动作
export interface InputAction extends BaseAction {
  type: 'input_text' | 'clear_and_input' | 'paste_clipboard';
  text?: string;
}

// 7. 打开动作
export interface OpenAction extends BaseAction {
  type: 'open_app' | 'open_url' | 'open_file';
  target: string;
}

// 8. 运行脚本动作
export interface RunScriptAction extends BaseAction {
  type: 'run_shell' | 'run_applescript';
  scriptContent: string;
  command?: string;
}

// 9. 界面等待动作
export interface UiWaitAction extends BaseAction {
  type: 'wait_text_appear' | 'wait_text_disappear';
  targetText: string;
  timeoutSeconds: number;
}

// 10. 保存截图动作
export interface SaveScreenshotAction extends BaseAction {
  type: 'save_screenshot';
  savePath?: string;
}

// 11. 延时动作
export interface DelayAction extends BaseAction {
  type: 'delay';
  seconds: number;
}

// 12. 条件判断动作
export interface ConditionAction extends BaseAction {
  type: 'condition';
  conditionType: string;
  targetText?: string;
}

// 联合动作类型
export type ScriptAction =
  | ClickPositionAction
  | ClickTextAction
  | DragLineAction
  | DragCurveAction
  | ScrollAction
  | InputAction
  | OpenAction
  | RunScriptAction
  | UiWaitAction
  | SaveScreenshotAction
  | DelayAction
  | ConditionAction
  | (BaseAction & { [key: string]: any });

// 脚本全局设置
export interface ScriptConfig {
  defaultWaitSeconds: number; // 默认等待 1.0 秒
  repeatCount: number;        // 重复次数：1 为单次，0 为无限循环
  pauseOnFailure: boolean;    // 有动作失败立即暂停
}

// 完整脚本模型
export interface AutomationScript {
  id: string;
  title: string;
  notes: string;
  config: ScriptConfig;
  actions: ScriptAction[];
  updatedAt: number;
}

// 执行状态
export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

// 日志项
export interface LogEntry {
  id: string;
  time?: string;
  timestamp?: string | number;
  type?: 'info' | 'success' | 'warn' | 'error';
  level?: 'info' | 'success' | 'warn' | 'error';
  message: string;
  actionId?: string;
  actionName?: string;
  stepIndex?: number;
  details?: any;
}

// 蒙版尺寸与位置
export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 蒙版交互模式
export type MaskInteractionMode =
  | 'none'
  | 'picking_point'
  | 'selecting_roi'
  | 'selecting_limit'
  | 'measuring_offset';

// 蒙版交互上下文
export interface MaskInteractionContext {
  mode: MaskInteractionMode;
  actionId?: string;
  actionName?: string;
  targetField?: string;
  offsetStep?: number;
  initialBasePoint?: { x: number; y: number };
  initialLimit?: { left: number; right: number; top: number; bottom: number; unit?: '%' | 'px' };
  promptText?: string;
}
