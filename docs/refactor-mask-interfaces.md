# 蒙版接口混乱重构计划

> 本文档是自包含的重构执行指南，无需额外上下文即可逐步实施。
> 所有变更均为类型层 + import 路径调整，不改变任何运行时行为逻辑。

---

## 一、问题概述

蒙版（Mask Overlay）相关的类型定义和接口存在 6 类混乱：

1. `RegionScopeConfig` 含大量死字段（`relX1/relX2/relY1/relY2`、`customX1/customX2/customY1/customY2`），全项目零引用
2. `baseType` 与 `type` 两个字段语义重叠，代码到处写 `scope?.baseType || (scope as any)?.type` 兼容
3. `RegionScopeType` 枚举值过多（6 个），实际只用 `'mask'` 和 `'step'` 两种
4. `RegionLimit` 接口定义了但从未被引用
5. `runHitAnchor`、`searchROI`、`baseROI` 三个 ref 全部内联手写 `{ x, y, width, height, ... }`，未复用已有的 `RegionBounds`
6. `scriptStore` 中有 10 个 re-export 透传 `maskStore` 的状态，增加理解负担

---

## 二、分步执行计划

### 步骤 1：精简类型定义

**文件**: `src/types/script.ts`

#### 1.1 删除 `RegionScopeType` 类型（第 53 行）

删除整行：
```ts
// 删除
export type RegionScopeType = 'limit' | 'mask' | 'relative_step' | 'custom' | 'fullscreen' | 'step';
```

#### 1.2 删除 `RegionLimit` 接口（第 56-62 行）

删除整个接口：
```ts
// 删除
export interface RegionLimit {
  left: number;
  right: number;
  top: number;
  bottom: number;
  unit: '%' | 'px';
}
```

#### 1.3 精简 `RegionScopeConfig`（第 65-82 行）

替换为：
```ts
export interface RegionScopeConfig {
  baseType?: RegionBaseType;
  targetStepIndex?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}
```

删除的字段清单：
- `type?: RegionScopeType` — 与 `baseType` 重复
- `unit?: '%' | 'px'` — AGENTS.md 规定只用 px
- `relX1/relX2/relY1/relY2` — 零引用
- `customX1/customX2/customY1/customY2` — 零引用

#### 1.4 新增统一矩形扩展类型（在 `RegionBounds` 之后插入）

`RegionBounds` 已在第 273-278 行定义为 `{ x, y, width, height }`，在其后追加：

```ts
/** 带标签的矩形区域（搜索 ROI、基准 ROI 共用） */
export interface LabeledBounds extends RegionBounds {
  label?: string;
}

/** 命中锚点矩形（绿框 + 准星） */
export interface HitAnchor extends RegionBounds {
  stepIndex: number;
  stepName: string;
}
```

#### 1.5 删除 `MaskInteractionContext.initialLimit` 中的 `unit` 字段（第 310 行）

```ts
// 修改前
initialLimit?: { left: number; right: number; top: number; bottom: number; unit?: '%' | 'px' };
// 修改后
initialLimit?: { left: number; right: number; top: number; bottom: number };
```

---

### 步骤 2：统一 maskStore 中的矩形类型

**文件**: `src/stores/maskStore.ts`

#### 2.1 更新 import（第 4-10 行区域）

```ts
import type {
  MaskInteractionMode,
  MaskInteractionContext,
  BaseStepMarker,
  ScriptAction,
  LabeledBounds,
  HitAnchor
} from '../types/script';
```

删除 `RegionScopeConfig` 的 import（此文件中 `calculateEffectiveROI` 通过 `action.regionScope` 间接使用，无需单独 import 类型）。

#### 2.2 替换 `runHitAnchor` 类型（第 64-71 行）

```ts
// 修改前
export const runHitAnchor = ref<{
  stepIndex: number;
  stepName: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);

// 修改后
export const runHitAnchor = ref<HitAnchor | null>(null);
```

#### 2.3 替换 `searchROI` 类型（第 77-83 行）

```ts
// 修改前
export const searchROI = ref<{
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
} | null>(null);

// 修改后
export const searchROI = ref<LabeledBounds | null>(null);
```

#### 2.4 替换 `baseROI` 类型（第 86-92 行）

```ts
// 修改前
export const baseROI = ref<{
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
} | null>(null);

// 修改后
export const baseROI = ref<LabeledBounds | null>(null);
```

#### 2.5 `setBaseROI` 函数参数类型简化（第 495-504 行）

```ts
// 修改前
export const setBaseROI = (roi: {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
} | null) => { ... };

// 修改后
export const setBaseROI = (roi: LabeledBounds | null) => { ... };
```

#### 2.6 `setRunHitAnchor` 函数参数类型简化（第 512-522 行）

```ts
// 修改前
export const setRunHitAnchor = (anchor: {
  stepIndex: number;
  stepName: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null) => { ... };

// 修改后
export const setRunHitAnchor = (anchor: HitAnchor | null) => { ... };
```

#### 2.7 `setSearchROI` 函数参数类型简化（第 529-539 行）

```ts
// 修改前
export const setSearchROI = (roi: {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
} | null) => { ... };

// 修改后
export const setSearchROI = (roi: LabeledBounds | null) => { ... };
```

#### 2.8 `startLimitSelection` 中删除 `unit` 字段（第 388-390 行区域）

```ts
// 修改前
initialLimit: options.initialLimit || { left: 0, right: 200, top: 0, bottom: 300, unit: 'px' },
// 修改后
initialLimit: options.initialLimit || { left: 0, right: 200, top: 0, bottom: 300 },
```

同时函数参数 `initialLimit` 类型也要去掉 `unit`：
```ts
// 修改前
initialLimit?: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  unit?: '%' | 'px';
};
// 修改后
initialLimit?: {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
```

---

### 步骤 3：简化 `calculateEffectiveROI` 中的兼容代码

**文件**: `src/stores/maskStore.ts`，`calculateEffectiveROI` 函数（第 575-651 行）

#### 3.1 删除 `type` 字段兼容逻辑（第 586-587 行）

```ts
// 修改前
// 兼容两种字段名：baseType (设计规范) 与 type (实际存储)
const bt = scope?.baseType || (scope as any)?.type;

// 修改后
const bt = scope?.baseType;
```

#### 3.2 简化分支判断

```ts
// 修改前（第 589 行）
if (bt === 'step' || bt === 'relative_step') {
// 修改后
if (bt === 'step') {

// 修改前（第 618 行）
if (scope && (bt === 'mask' || bt === 'limit' || bt === 'custom')) {
// 修改后
if (scope && bt === 'mask') {
```

---

### 步骤 4：简化 automationController 中的兼容代码

**文件**: `src/services/automationController.ts`

#### 4.1 `hasCustomLimitRegion` 函数（第 108-124 行）

```ts
// 修改前（第 111-112 行）
// 兼容两种字段名：baseType (设计规范) 与 type (实际存储)
const bt = scope.baseType || (scope as any).type;

// 修改后
const bt = scope.baseType;

// 修改前（第 113 行）
if (bt === 'step' || bt === 'relative_step') return true;
// 修改后
if (bt === 'step') return true;

// 修改前（第 114 行）
if (bt === 'mask' || bt === 'limit' || bt === 'custom') {
// 修改后
if (bt === 'mask') {
```

---

### 步骤 5：清理 scriptStore re-export

**文件**: `src/stores/scriptStore.ts`

#### 5.1 删除蒙版状态 re-export（第 141-150 行区域）

删除以下全部 re-export 行：
```ts
// 全部删除
export const showRegionMask = maskStore.visible;
export const isMaskMinimized = maskStore.isMinimized;
export const isMaskFullscreen = maskStore.isFullscreen;
export const regionBounds = maskStore.bounds;
export const maskInteractionMode = maskStore.mode;
export const maskInteractionContext = maskStore.context;
export const runHitAnchor = maskStore.runHitAnchor;
export const searchROI = maskStore.searchROI;
export const lastBaseMarkerMap = maskStore.lastBaseMarkerMap;
```

#### 5.2 删除 `calculateEffectiveROI` 透传（第 377-378 行区域）

```ts
// 删除
export const calculateEffectiveROI = (action: ScriptAction, stepIndex: number, coords: Record<number, { x: number; y: number }>) =>
  maskStore.calculateEffectiveROI(action, stepIndex, coords);
```

#### 5.3 清理 scriptStore 聚合对象中的引用

在 `scriptStore` 导出对象中（约第 520 行区域），删除已不再存在的属性：
```ts
// 删除这几个属性
runHitAnchor,
searchROI,
```

#### 5.4 `reportMaskLimitSelected` 中删除 `unit` 参数使用（约第 330-340 行区域）

```ts
// 修改前
targetAction.regionScope.unit = 'px';
// 删除此行（unit 字段已从类型中移除）
```

检查 `reportMaskLimitSelected` 函数签名，如果有 `unit` 参数也删除。

---

### 步骤 6：迁移外部消费者

#### 6.1 `src/components/AddEditScript.vue`

搜索所有 `scriptStore.showRegionMask`，替换为 `maskStore.visible`。

在 import 区域添加：
```ts
import { maskStore } from '../stores/maskStore';
```

（该文件如已 import maskStore 则无需重复。）

需修改的行（约 4 处）：
- 第 884 行：`scriptStore.showRegionMask.value` → `maskStore.visible.value`
- 第 905 行：`scriptStore.showRegionMask.value = res.visible` → `maskStore.visible.value = res.visible`
- 第 1075 行：`!scriptStore.showRegionMask.value` → `!maskStore.visible.value`
- 第 1157 行：`!scriptStore.showRegionMask.value` → `!maskStore.visible.value`

同时从 scriptStore import 中移除 `showRegionMask`（如果作为命名导入的话）。

#### 6.2 `src/components/ScriptsList.vue`

第 301 行：`scriptStore.showRegionMask.value` → `maskStore.visible.value`

添加 import：
```ts
import { maskStore } from '../stores/maskStore';
```

#### 6.3 `src/components/ActionLimitConfig.vue`

第 191 行区域，`startSelectLimitRegion` 函数中：
```ts
// 修改前
initialLimit: {
  left: Number(s.left) || 0,
  right: Number(s.right) || 0,
  top: Number(s.top) || 0,
  bottom: Number(s.bottom) || 0,
  unit: 'px'
}
// 修改后（删除 unit 行）
initialLimit: {
  left: Number(s.left) || 0,
  right: Number(s.right) || 0,
  top: Number(s.top) || 0,
  bottom: Number(s.bottom) || 0
}
```

#### 6.4 `src/stores/scriptRecordingStore.ts`

检查第 101 行和第 124 行附近 `RegionScopeConfig` 的赋值，确认无 `unit`、`type`、`relX*`、`customX*` 等已删除字段。如有则删除。

#### 6.5 `src/types/defaultScripts.ts`

检查所有 `regionScope` 对象字面量（第 28、40、65、80 行），确认无已删除字段。当前只有 `baseType`/`left`/`right`/`top`/`bottom`，无需改动。

---

### 步骤 7（可选增强）：广播消息类型化

**文件**: `src/types/script.ts`（新增类型）+ `src/stores/maskStore.ts`（改签名）

> 此步骤改动面较大，可作为后续独立 PR 实施。如一并执行，方案如下：

#### 7.1 在 `src/types/script.ts` 末尾新增：

```ts
export type MaskSyncMessage =
  | { type: 'bounds_updated'; bounds: RegionBounds }
  | { type: 'visibility_updated'; show: boolean; isMinimized: boolean; isFullscreen: boolean }
  | { type: 'mask_interaction_start'; context: MaskInteractionContext }
  | { type: 'mask_interaction_cancel' }
  | { type: 'run_hit_anchor_updated'; anchor: HitAnchor | null }
  | { type: 'search_roi_updated'; roi: LabeledBounds | null }
  | { type: 'base_roi_updated'; roi: LabeledBounds | null }
  | { type: 'overlay_dodge_updated'; dodged: boolean }
  | { type: 'base_marker_updated'; stepIndex: number; marker: BaseStepMarker | null };
```

#### 7.2 修改 `broadcastMaskSync` 签名

```ts
// 修改前
export const broadcastMaskSync = (type: string, data: Record<string, any> = {}) => {
  const payload = JSON.parse(JSON.stringify({ type, ...data }));

// 修改后
export const broadcastMaskSync = (msg: MaskSyncMessage) => {
  const payload = JSON.parse(JSON.stringify(msg));
```

#### 7.3 修改所有调用点

所有 `broadcastMaskSync('xxx', { ... })` 改为 `broadcastMaskSync({ type: 'xxx', ... })`。

maskStore 内共约 12 处调用点需要调整，每处都是简单的参数合并：
```ts
// 修改前
broadcastMaskSync('bounds_updated', { bounds: { ...bounds } });
// 修改后
broadcastMaskSync({ type: 'bounds_updated', bounds: { ...bounds } });
```

#### 7.4 修改 `handleMaskSyncMessage` 参数类型

```ts
// 修改前
export const handleMaskSyncMessage = (msg: any) => {
// 修改后
export const handleMaskSyncMessage = (msg: MaskSyncMessage) => {
```

---

## 三、执行顺序与依赖关系

```
步骤 1 (types/script.ts)
  ↓
步骤 2 (stores/maskStore.ts 类型替换)
  ↓
步骤 3 (stores/maskStore.ts 兼容代码清理)    ← 可与步骤 2 合并
  ↓
步骤 4 (services/automationController.ts)    ← 依赖步骤 1
  ↓
步骤 5 (stores/scriptStore.ts re-export 清理)
  ↓
步骤 6 (组件层 import 迁移)                   ← 依赖步骤 5
  ↓
步骤 7 (广播类型化，可选)                      ← 依赖步骤 1、2
```

步骤 1-6 为必做项，步骤 7 为可选增强。

---

## 四、验证清单

每步完成后运行以下检查：

- [ ] `npx tsc --noEmit` 零错误（TypeScript 类型检查通过）
- [ ] `grep -rn 'relX1\|relX2\|relY1\|relY2\|customX1\|customX2\|customY1\|customY2' src/` 零命中
- [ ] `grep -rn 'RegionLimit\b' src/` 仅在删除确认中出现（应为零命中）
- [ ] `grep -rn 'RegionScopeType\b' src/` 零命中
- [ ] `grep -rn '(scope as any)' src/` 零命中
- [ ] `grep -rn 'scriptStore\.showRegionMask\|scriptStore\.runHitAnchor\|scriptStore\.searchROI' src/` 零命中
- [ ] 应用启动后蒙版显示/隐藏/拖拽/缩放正常
- [ ] 限制区域选区（橙色框）打开/拖拽/确认/取消正常
- [ ] 定位基准步骤（绿色准星）命中绘制正常
- [ ] 测试单步 OCR 识别 + 蓝色虚线框绘制正常

---

## 五、安全注意事项

1. **持久化数据兼容**：`baseType: 'mask' | 'step'` 是实际存储到 JSON 的字段，本次重构保持不变。已有脚本 JSON 中可能残留 `type`/`unit`/`relX1` 等字段，TypeScript 类型收窄后 JSON 反序列化会自然忽略多余字段，无需数据迁移。

2. **AGENTS.md 铁律遵守**：
   - 单文件不超过 600 行（本次重构只做删减，不会增加行数）
   - 数据绝对保真（不改变 `left/right/top/bottom` 像素值的存储与计算逻辑）
   - 先画框后识别、定位无副作用（不改变任何运行时时序）

3. **不做的事**：
   - 不重命名 `baseType` 字段（影响持久化）
   - 不改变 `BroadcastChannel` 通道名或消息结构的运行时行为
   - 不改变 `calculateEffectiveROI` 的计算逻辑
