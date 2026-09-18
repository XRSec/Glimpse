# 状态管理混乱修复计划：蒙版可见性、数据脏检测与 scriptStore 门面瘦身

> 核心问题：Vue 的 `ref()` 响应式系统没有被正确利用，状态散落在多个写入路径中，没有单一数据源。

---

## 一、问题诊断

### 问题 A：蒙版可见性有 4 条写入路径，互相不知道

| 写法 | 出现位置 | 后果 |
|------|----------|------|
| `maskStore.setVisible(show)` | maskStore、automationController、appTargetStore、scriptRunner、scriptRecordingStore、ActionLimitConfig | 正路：设 ref → 广播 → invoke 原生 |
| `scriptStore.setMaskVisible(show)` | AddEditScript、RegionMaskOverlay、ScriptsList | 多一层透传包装，读者不知道跟 maskStore 是同一个东西 |
| `maskStore.visible.value = res.visible` | AddEditScript.vue:906 | **绕过了 `setVisible`**，不触发广播和原生 invoke |
| `visible.value = !!msg.show` | maskStore.ts:96 (BroadcastChannel 收消息) | 合理但和上面直接赋值混在一起时分不清哪个先到 |

**结果**：主窗口改了 `visible`，蒙版窗口不知道；蒙版窗口关了，主窗口 UI 按钮状态不更新。

### 问题 B：`isDirty` 用 JSON.stringify 全量对比

```ts
// AddEditScript.vue:873
const isDirty = computed(() => {
  if (!script.value) return false;
  return JSON.stringify(script.value) !== savedSnapshot.value;
});
```

- 每次任何 reactive 依赖变化都重新序列化整个脚本对象
- 拖拽蒙版触发 `bounds` 更新 → 如果模板中读了 `isDirty` → 全量 JSON.stringify 重算
- 这不是"不同步"，是**每帧都在做昂贵对比但结果来得不够及时**

### 问题 C：`scriptStore` 是一个 34 个导出的上帝门面

`scriptStore.ts` 从 5 个子模块 re-export 所有内容：
- `maskStore`（已在上一轮清理大部分，但 `setMaskVisible` 仍保留）
- `appTargetStore`（12 个函数）
- `scriptRecordingStore`（6 个符号）
- `scriptRunner`（11 个符号）
- `automationController`（间接）

**结果**：组件 `import { xxx } from '../stores/scriptStore'` 拿到的东西可能来自任何子模块，无法一眼看清依赖关系，也无法 tree-shake。

### 问题 D：脚本运行阻塞 UI

`scriptRunner.runScript()` 是一个 `async` 函数，在主线程中用 `while` 循环 + `await sleepWithControl` 控制节奏。虽然每步之间有 `await`（让出微任务队列），但：
- `invoke('click_text_ocr', ...)` 等 Tauri IPC 调用会阻塞 JS 直到 Rust 侧返回
- OCR 超时最长 3 秒，这 3 秒内 Vue 无法响应 UI 交互
- `while (controller.pause)` 虽有 100ms sleep，但 `executionStatus` 的 ref 更新和 UI 重绘可能跟不上

---

## 二、修复计划

### 步骤 1：统一蒙版可见性为单一入口

**原则**：`maskStore.setVisible()` 是唯一合法的写入路径。

**文件 & 变更**：

#### 1.1 删除 `scriptStore.setMaskVisible` 透传

**文件**: `src/stores/scriptStore.ts`

```ts
// 删除这行
export const setMaskVisible = (show: boolean) => maskStore.setVisible(show);
```

同时从 scriptStore 聚合导出对象中删除 `setMaskVisible`。

#### 1.2 迁移所有 `setMaskVisible` 消费者

| 文件 | 修改 |
|------|------|
| `src/components/AddEditScript.vue:859` | import 改为 `import { maskStore } from '../stores/maskStore'`，调用改为 `maskStore.setVisible(show)` |
| `src/components/AddEditScript.vue:1031` | `await setMaskVisible(show)` → `await maskStore.setVisible(show)` |
| `src/components/RegionMaskOverlay.vue:234` | import 中去掉 `setMaskVisible`，改用 `maskStore.setVisible` |
| `src/components/RegionMaskOverlay.vue:685,721` | `await setMaskVisible(false)` → `await maskStore.setVisible(false)` |
| `src/components/ScriptsList.vue:314` | `await scriptStore.setMaskVisible(true)` → `await maskStore.setVisible(true)` |

#### 1.3 修复 AddEditScript 中绕过 `setVisible` 的直接赋值

**文件**: `src/components/AddEditScript.vue:904-907`

```ts
// 修改前
const res: any = await invoke('get_mask_screen_bounds');
if (res && typeof res.visible === 'boolean') {
  maskStore.visible.value = res.visible;  // ← 绕过了 setVisible！
}

// 修改后：用 syncFromNative 统一获取状态
await maskStore.syncFromNative();
```

如果 `syncFromNative` 当前不同步 visible 状态，则扩展它：

**文件**: `src/stores/maskStore.ts` 的 `syncFromNative` 函数（约第 238 行）

```ts
export const syncFromNative = async (): Promise<boolean> => {
  if (!isTauriEnv()) return false;
  try {
    const rawBounds: any = await invoke('get_mask_screen_bounds');
    if (rawBounds && typeof rawBounds.x === 'number' && typeof rawBounds.y === 'number') {
      bounds.x = Math.round(rawBounds.x);
      bounds.y = Math.round(rawBounds.y);
      bounds.width = Math.round(rawBounds.width);
      bounds.height = Math.round(rawBounds.height);
      // ★ 新增：同步原生窗口可见性到 Vue ref
      if (typeof rawBounds.visible === 'boolean') {
        visible.value = rawBounds.visible;
      }
      saveBoundsToStorage();
      broadcastMaskSync('bounds_updated', { bounds: { ...bounds } });
      return true;
    }
  } catch (e) {}
  return false;
};
```

---

### 步骤 2：`isDirty` 改为轻量版本号方案

**原则**：不再每次 computed 求值时 JSON.stringify 整个脚本。改用"修改版本号"机制。

**文件**: `src/components/AddEditScript.vue`

#### 2.1 替换 isDirty 实现

```ts
// 修改前
const savedSnapshot = ref<string>('');
const isDirty = computed(() => {
  if (!script.value) return false;
  return JSON.stringify(script.value) !== savedSnapshot.value;
});

// 修改后
const savedVersion = ref(0);
const currentVersion = ref(0);
const isDirty = computed(() => currentVersion.value !== savedVersion.value);

const markDirty = () => { currentVersion.value++; };

const markClean = () => { savedVersion.value = currentVersion.value; };
```

#### 2.2 在编辑操作时调用 `markDirty()`

搜索 AddEditScript.vue 中所有修改 `script.value` 属性的地方，在修改后调用 `markDirty()`。典型位置：
- 修改脚本标题 / notes
- 添加 / 删除 / 重排动作
- 修改动作属性（联动 ActionRow、ActionSpecificParams、ActionLimitConfig）

**注意**：ActionLimitConfig 和 ActionSpecificParams 是子组件，直接 mutate props（`props.action.regionScope.left = xxx`）。这些修改不会自动触发父组件的 `markDirty`。

**解决方案**：用 `watch` deep 监听 `script.value`：

```ts
watch(
  () => script.value,
  () => { markDirty(); },
  { deep: true }
);
```

这比 JSON.stringify 便宜得多——Vue 的 deep watch 只在实际发生变化时触发回调，而 computed + JSON.stringify 在任何 reactive 读取时都会重新求值。

#### 2.3 保存时调用 `markClean()`

在 `saveScript` 函数末尾：

```ts
// 修改前
savedSnapshot.value = JSON.stringify(script.value);

// 修改后
markClean();
```

#### 2.4 进入编辑页时初始化

```ts
// 修改前（onMounted 中）
savedSnapshot.value = JSON.stringify(script.value);

// 修改后
savedVersion.value = 0;
currentVersion.value = 0;
```

---

### 步骤 3：scriptStore 门面瘦身 — 仅保留自身职责

**原则**：scriptStore 只做脚本 CRUD、编辑状态管理、蒙版交互回调。子模块的函数由消费者直接 import 子模块。

**文件**: `src/stores/scriptStore.ts`

#### 3.1 删除纯透传导出

以下导出仅是透传，删除后让消费者直接 import 源模块：

```ts
// 删除以下 re-export（已在步骤 1 删了 setMaskVisible，这里继续）
export const syncMaskBoundsFromNative = () => maskStore.syncFromNative();

export const startMaskLimitSelection = (...) => maskStore.startLimitSelection(...);
export const startMaskPointPicking = (...) => maskStore.startPointPicking(...);
export const startMaskROISelection = (...) => maskStore.startROISelection(...);
export const startMaskOffsetMeasurement = (...) => maskStore.startOffsetMeasurement(...);
export const cancelMaskInteraction = () => maskStore.cancelInteraction();
```

**注意**：`reportMaskPointPicked` 和 `reportMaskLimitSelected` **不是**纯透传——它们包含业务逻辑（修改 editingScript 的动作属性）。这些必须保留在 scriptStore 中。

#### 3.2 迁移消费者

| 被删函数 | 消费者文件 | 改为 |
|----------|-----------|------|
| `startMaskLimitSelection` | `ActionLimitConfig.vue:89` | `import { maskStore } from '../stores/maskStore'` → `maskStore.startLimitSelection(...)` |
| `startMaskPointPicking` | `ActionSpecificParams.vue:338` | 同上 |
| `cancelMaskInteraction` | `RegionMaskOverlay.vue` | 已用 `scriptStore.cancelMaskInteraction()`，改为 `maskStore.cancelInteraction()` |
| `setMaskVisible` | （已在步骤 1 处理） | — |
| `syncMaskBoundsFromNative` | 检查是否有消费者，如无则直接删除 | — |

#### 3.3 清理聚合导出对象

`scriptStore` 底部的聚合对象中，删除所有已移除的属性名。

---

### 步骤 4：脚本运行不阻塞 UI（轻量方案）

**原则**：不做 Web Worker 大重构，而是在关键阻塞点让出主线程。

**文件**: `src/stores/scriptRunner.ts`

#### 4.1 在每步执行前后插入 `await nextTick()`

```ts
import { nextTick } from 'vue';

// executeSingleAction 函数中，在 invoke 调用前后加 nextTick：
export const executeSingleAction = async (...) => {
  currentStepIndex.value = stepIndex;
  broadcastSyncFn('state_updated', { currentStepIndex: stepIndex });

  // ★ 让出主线程，让 Vue 渲染一帧
  await nextTick();

  // ... 后续逻辑
};
```

#### 4.2 在循环体中保证 UI 刷新

```ts
// runScript 函数中的 for 循环（约第 404 行）
for (let i = 0; i < script.actions.length; i++) {
  if (controller.abort) break;
  while (controller.pause) {
    if (controller.abort) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // ★ 每步之前让出一帧
  await new Promise((r) => setTimeout(r, 0));

  const action = script.actions[i];
  const stepSuccess = await executeSingleAction(action, i, globalWait, controller, executedStepCoordinates);
  // ...
}
```

#### 4.3 executionStatus 更新即时生效

确保 `executionStatus.value` 的赋值后立即 `await nextTick()`，让 UI 按钮状态即时更新：

```ts
// 暂停
executionStatus.value = 'paused';
broadcastSyncFn('state_updated', { executionStatus: 'paused' });
await nextTick();  // ★

// 恢复
executionStatus.value = 'running';
broadcastSyncFn('state_updated', { executionStatus: 'running' });
await nextTick();  // ★
```

---

## 三、执行顺序

```
步骤 1 (统一蒙版可见性)
  ↓
步骤 2 (isDirty 轻量化)     ← 独立于步骤 1，可并行
  ↓
步骤 3 (scriptStore 瘦身)   ← 依赖步骤 1
  ↓
步骤 4 (脚本运行不卡 UI)    ← 独立
```

步骤 1 和 2 可并行，步骤 3 依赖步骤 1，步骤 4 完全独立。

---

## 四、涉及文件清单

| 文件 | 变更类型 |
|------|----------|
| `src/stores/maskStore.ts` | `syncFromNative` 增加 visible 同步 |
| `src/stores/scriptStore.ts` | 删除 `setMaskVisible`、6 个蒙版交互透传、`syncMaskBoundsFromNative` |
| `src/stores/scriptRunner.ts` | 关键位置插入 `nextTick()` / `setTimeout(0)` |
| `src/components/AddEditScript.vue` | isDirty 重构 + setMaskVisible 迁移 + visible 直写修复 |
| `src/components/RegionMaskOverlay.vue` | setMaskVisible → maskStore.setVisible |
| `src/components/ScriptsList.vue` | setMaskVisible → maskStore.setVisible |
| `src/components/ActionLimitConfig.vue` | startMaskLimitSelection → maskStore.startLimitSelection |
| `src/components/ActionSpecificParams.vue` | startMaskPointPicking → maskStore.startPointPicking |

---

## 五、验证清单

- [ ] `npx vue-tsc --noEmit` 零错误
- [ ] `npm run build` 成功
- [ ] `grep -rn 'setMaskVisible' src/` 零命中
- [ ] `grep -rn 'syncMaskBoundsFromNative' src/` 零命中
- [ ] `grep -rn 'startMaskLimitSelection\|startMaskPointPicking\|startMaskROISelection\|startMaskOffsetMeasurement' src/stores/scriptStore.ts` 零命中
- [ ] `grep -rn 'maskStore\.visible\.value\s*=' src/` 仅出现在 `maskStore.ts` 内部和 BroadcastChannel 处理中
- [ ] 功能验证：
  - 主窗口点击"显示蒙版"→ 蒙版窗口出现，按钮状态同步
  - 蒙版窗口菜单关闭 → 主窗口按钮状态即时更新
  - 编辑脚本标题 → 保存按钮立刻高亮为 dirty 状态
  - 保存 → dirty 清除，按钮灰掉
  - 运行脚本 → UI 不冻结，暂停/停止按钮可响应
