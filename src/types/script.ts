// 动作分类
export type ActionCategory =
  | 'click'      // 点击
  | 'drag'       // 拖动
  | 'input'      // 输入
  | 'open'       // 打开
  | 'run'        // 运行
  | 'ui'         // 界面
  | 'identify'   // 识别
  | 'advanced';  // 高级

// 完整动作类型定义，对应截图的两级级联菜单
export type ActionType =
  // 1. 点击系列
  | 'click_position'   // 点击坐标
  | 'click_image'      // 点击图片
  | 'click_text'       // 点击文字 (Apple 原生 Vision OCR)
  | 'click_color'      // 点击颜色
  | 'click_node'       // 点击节点
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
  | 'condition'        // 条件判断
  // 8. 识别系列（纯识别，不执行操作，记录命中位置供后续步骤引用）
  | 'identify_text'    // 识别文字 (OCR)
  | 'identify_image'   // 识别图片
  | 'identify_color'   // 识别颜色
  | 'identify_node';   // 识别节点

// 鼠标按键类型：左键、双击、右键
export type MouseButton = 'left' | 'double' | 'right';

// 识别区域基准类型：'mask'（基于脚本运行蒙版）或 'step'（基于某个步骤的点击位置）
export type RegionBaseType = 'mask' | 'step';
// 限制识别区域配置 (使用纯像素数值 px，并支持基于谁限制)
export interface RegionScopeConfig {
  baseType?: RegionBaseType;
  targetStepIndex?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

// 基础动作模型
export interface BaseAction {
  id: string;
  name: string;
  type: ActionType;
  isEnabled: boolean;
  isExpanded: boolean;
  customWaitSeconds?: number | null;
  retryCount?: number;          // 失败重试次数 (默认 0 不重试)
  retryWaitSeconds?: number;    // 重试间隔秒数 (默认 1.0)
  recognizeMode?: 'local' | 'cloud';
  /**
   * OCR 截图缩放比例，代表降采样以加速识别。
   * 1.0: 原始物理分辨率 (Retina, 默认)
   * 0.75: 75% 尺寸
   * 0.5: 50% 尺寸
   */
  ocrImageScale?: 0.5 | 0.75 | 1.0 | number;
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
  | IdentifyAction
  | (BaseAction & { [key: string]: any });

// 纯识别动作（只识别定位，不执行点击/输入等操作，命中结果记录供后续步骤引用）
export interface IdentifyAction extends BaseAction {
  type: 'identify_text' | 'identify_image' | 'identify_color' | 'identify_node';
  targetText?: string;     // OCR 文字识别目标（identify_text）
  matchMode?: 'contains' | 'exact' | 'regex';
  fuzzyMatch?: boolean;
  timeoutSeconds?: number;
  offsetX?: number;
  offsetY?: number;
}

// 目标应用配置与窗口动态尺寸管理
export interface TargetAppConfig {
  appName?: string;          // 目标应用名称 (如 "微信", "Safari 浏览器", "Google Chrome")
  bundleId?: string;         // 应用 Bundle ID (如 "com.apple.Safari")
  windowTitle?: string;      // 目标窗口标题
  pid?: number;              // 目标应用进程 PID
  // 首次或手动记录的应用窗口初始位置与尺寸
  initialBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // 动态尺寸与前台控制
  autoResizeOnRun?: boolean; // 后续启动脚本时，是否自动将目标 App 窗口重置为记录的宽高 (默认 true)
  autoMoveOnRun?: boolean;   // 启动脚本时，是否同时将目标 App 窗口移动到原屏幕坐标
  autoFocusOnRun?: boolean;  // 启动脚本前，是否自动唤醒激活目标 App 至最前台 (默认 true)
}

// 脚本全局设置
export interface ScriptConfig {
  defaultWaitSeconds: number; // 默认等待 1.0 秒
  repeatCount: number;        // 重复次数：1 为单次，0 为无限循环
  pauseOnFailure: boolean;    // 有动作失败立即暂停
  executionSpeed?: number;    // 执行倍速: 0.5, 1.0, 1.5, 2.0 (默认 1.0)
  exportMarkdownReport?: boolean; // 是否生成 Markdown 诊断报告 (默认 false)
}

// 完整脚本模型
export interface AutomationScript {
  id: string;
  title: string;
  notes: string;
  config: ScriptConfig;
  targetApp?: TargetAppConfig;
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

/** 带标签的矩形区域（搜索 ROI、基准 ROI 共用） */
export interface LabeledBounds extends RegionBounds {
  label?: string;
}

/** 命中锚点矩形（绿框 + 准星） */
export interface HitAnchor extends RegionBounds {
  stepIndex: number;
  stepName: string;
}

// 蒙版交互模式
export type MaskInteractionMode =
  | 'none'
  | 'picking_point'
  | 'selecting_roi'
  | 'selecting_limit'
  | 'measuring_offset'
  | 'viewing_marker';

// 基准步骤命中标记 (用于基于步骤时在蒙版上先识别、再高亮标记、再选位置)
export interface BaseStepMarker {
  stepIndex: number;
  stepName: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  targetText?: string;
  roi?: { x: number; y: number; width: number; height: number };
}

// 蒙版交互上下文
export interface MaskInteractionContext {
  mode: MaskInteractionMode;
  actionId?: string;
  actionName?: string;
  targetField?: string;
  offsetStep?: number;
  initialBasePoint?: { x: number; y: number };
  initialLimit?: { left: number; right: number; top: number; bottom: number };
  promptText?: string;
  baseMarker?: BaseStepMarker;
  /** 定位模式下显示的限制区域预览矩形配置（以 baseMarker 为原点的偏移值，单位 px） */
  previewRegionScope?: RegionScopeConfig;
}
