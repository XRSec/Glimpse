<template>
  <div
    class="rounded-xl border transition-all duration-200 overflow-hidden relative"
    :class="[
      action.isEnabled
        ? 'bg-claude-card border-claude-border hover:border-claude-border-hover'
        : 'bg-claude-bg/60 border-claude-border/50 opacity-60',
      isCurrentRunning ? 'ring-2 ring-claude-terracotta border-claude-terracotta/80 shadow-lg shadow-claude-terracotta/15' : '',
      !isLast ? 'action-row-connected' : ''
    ]"
  >
    <!-- ================= 卡片头部栏 (点击空白处展开/折叠) ================= -->
    <div
      class="px-4 py-2 flex items-center justify-between cursor-pointer transition-colors hover:bg-claude-card/50"
      @click="toggleExpand"
    >
      <!-- 左侧：拖拽手柄 + 序号 + 状态 + 类型图标 + 名称 + 摘要 -->
      <div class="flex items-center gap-2 min-w-0 flex-1 mr-3">
        <!-- 拖拽手柄 -->
        <div class="drag-handle cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-claude-subtle hover:text-claude-muted shrink-0" @click.stop>
          <GripVertical class="w-3.5 h-3.5" />
        </div>
        <!-- 序号圆标 -->
        <span
          class="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors"
          :class="[
            isCurrentRunning
              ? 'bg-claude-terracotta text-white animate-pulse'
              : action.isEnabled
              ? 'bg-claude-card text-claude-text border border-claude-border'
              : 'bg-claude-bg text-claude-subtle border border-claude-border/50'
          ]"
        >
          {{ index + 1 }}
        </span>

        <!-- 执行状态图标 -->
        <span v-if="stepStatus === 'running'" class="shrink-0" title="执行中">
          <Loader2 class="w-3.5 h-3.5 text-claude-terracotta animate-spin" />
        </span>
        <span v-else-if="stepStatus === 'success'" class="shrink-0" title="成功">
          <Check class="w-3.5 h-3.5 text-emerald-400" />
        </span>
        <span v-else-if="stepStatus === 'failed'" class="shrink-0" title="失败">
          <X class="w-3.5 h-3.5 text-red-400" />
        </span>
        <span v-else-if="stepStatus === 'dry_run'" class="shrink-0" title="安全试运行">
          <ShieldCheck class="w-3.5 h-3.5 text-sky-400" />
        </span>
        <span v-else-if="stepStatus === 'skipped'" class="shrink-0" title="已跳过">
          <Minus class="w-3.5 h-3.5 text-claude-subtle" />
        </span>

        <!-- 类型图标 -->
        <div
          class="p-1.5 rounded-lg shrink-0"
          :class="getActionIconBadgeClass(action.type)"
        >
          <component :is="getActionIcon(action.type)" class="w-4 h-4" />
        </div>

        <!-- 【输入框 / 备注】 -->
        <template v-if="action.isExpanded">
          <input
            v-model="action.name"
            placeholder="标题"
            :style="{ width: `${Math.min(200, Math.max(56, ((action.name || '标题').length * 13 + 20)))}px` }"
            class="px-2 py-0.5 text-xs rounded-lg bg-claude-bg border border-claude-border text-claude-text placeholder-claude-subtle focus:border-claude-terracotta focus:outline-none min-w-[56px] max-w-[200px] font-medium transition-[width] duration-150"
            @click.stop
            title="动作标题/备注"
          />
        </template>
        <template v-else>
          <span v-if="action.name" class="text-sm font-semibold text-claude-text truncate">{{ action.name }}</span>
        </template>

        <!-- 【点击文字（OCR）】 -->
        <span class="text-xs text-zinc-300 font-medium shrink-0">{{ getActionDefaultTitle(action.type) }}</span>

        <!-- 【内容】 -->
        <template v-if="action.type === 'click_text' || action.type === 'identify_text'">
          <span v-if="(action as ClickTextAction).targetText" class="text-xs text-amber-200 font-medium">“{{ (action as ClickTextAction).targetText }}”</span>
        </template>
        <template v-else-if="action.type === 'click_position'">
          <span class="text-xs text-claude-terracotta font-medium">({{ (action as ClickPositionAction).x }}, {{ (action as ClickPositionAction).y }})</span>
        </template>
        <template v-else-if="action.type === 'drag_line'">
          <span class="text-xs text-emerald-300 font-medium">({{ (action as DragLineAction).startX }}, {{ (action as DragLineAction).startY }}) → ({{ (action as DragLineAction).endX }}, {{ (action as DragLineAction).endY }})</span>
        </template>
        <template v-else-if="action.type === 'input_text' || action.type === 'clear_and_input'">
          <span v-if="(action as InputAction).text" class="text-xs text-rose-300 font-medium truncate max-w-[140px]">“{{ (action as InputAction).text }}”</span>
        </template>
        <template v-else-if="action.type === 'send_key'">
          <span v-if="(action as SendKeyAction).key" class="text-xs px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono font-medium">{{ (action as SendKeyAction).key }}</span>
          <span v-if="((action as SendKeyAction).repeat ?? 1) > 1" class="text-[11px] text-zinc-400 font-mono">×{{ (action as SendKeyAction).repeat }}</span>
        </template>
        <template v-else-if="action.type === 'delay'">
          <span class="text-xs text-zinc-300">{{ (action as any).seconds }}s</span>
        </template>
        <template v-else-if="action.type === 'scroll'">
          <span class="text-xs text-cyan-300">滚轮{{ (action as ScrollAction).direction === 'up' ? '向上' : '向下' }} {{ (action as ScrollAction).distance }}步</span>
        </template>

        <!-- 【右键】 -->
        <span v-if="(action as any).button" class="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.08] shrink-0">{{ getButtonLabel((action as any).button) }}</span>
        <span class="text-xs text-zinc-400 font-normal shrink-0">等 {{ action.customWaitSeconds != null && action.customWaitSeconds !== undefined && !isNaN(Number(action.customWaitSeconds)) ? `${action.customWaitSeconds}s` : `${currentDefaultWait}s` }}</span>

        <!-- 【本地识别 限制区域】 -->
        <span v-if="isRecognitionAction" class="text-[10px] px-2 py-0.5 rounded-full bg-claude-terracotta/15 border border-claude-terracotta/30 text-claude-terracotta font-medium shrink-0 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-claude-terracotta"></span><span>本地识别 限制区域</span></span>

        <!-- 【限制区域/基于 XXX 限制】 -->
        <span v-if="action.regionScope && getRegionScopeBadge(action.regionScope)" class="text-[10px] px-1.5 py-0.5 rounded bg-claude-terracotta/15 border border-claude-terracotta/30 text-claude-terracotta font-medium shrink-0">{{ getRegionScopeBadge(action.regionScope) }}</span>
      </div>


      <!-- 右侧控制区：耗时 + 测试 + 启用 + 排序 + 删除 + 折叠展开 -->
      <div class="flex items-center gap-2 shrink-0" @click.stop>
        <!-- 步骤耗时 badge -->
        <span
          v-if="stepDuration"
          class="text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 flex items-center gap-0.5"
          :class="stepStatus === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/[0.04] text-claude-muted border border-[#383430]'"
        >
          <Clock class="w-2.5 h-2.5" />
          {{ stepDuration }}
        </span>
        <!-- 单步测试按钮 (单独执行并调试本步骤) -->
        <button
          type="button"
          @click="handleTestStep"
          :disabled="isTestingStep"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-claude-card hover:bg-claude-terracotta/20 text-claude-text hover:text-claude-terracotta border border-claude-border transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
          title="单独执行并调试此步骤"
        >
          <Loader2 v-if="isTestingStep" class="w-3 h-3 text-claude-terracotta animate-spin" />
          <Play v-else class="w-3 h-3 fill-current text-claude-terracotta" />
          <span class="hidden sm:inline">{{ isTestingStep ? '测试中...' : '测试' }}</span>
        </button>

        <!-- 启用开关 Toggle -->
        <button
          type="button"
          @click="toggleEnabled"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
          :class="action.isEnabled ? 'bg-claude-terracotta' : 'bg-claude-card border border-claude-border'"
          title="启用/禁用当前动作"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
            :class="action.isEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>

        <!-- 上移按钮 -->
        <button
          type="button"
          @click="$emit('move-up')"
          :disabled="isFirst"
          class="p-1 rounded-md text-claude-muted hover:text-claude-text hover:bg-claude-card disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          title="上移"
        >
          <ChevronUp class="w-4 h-4" />
        </button>

        <!-- 下移按钮 -->
        <button
          type="button"
          @click="$emit('move-down')"
          :disabled="isLast"
          class="p-1 rounded-md text-claude-muted hover:text-claude-text hover:bg-claude-card disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          title="下移"
        >
          <ChevronDown class="w-4 h-4" />
        </button>

        <!-- 删除按钮 -->
        <button
          type="button"
          @click="$emit('delete')"
          class="p-1 rounded-md text-claude-muted hover:text-red-400 hover:bg-claude-card transition-colors cursor-pointer"
          title="删除此动作"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <!-- 展开折叠箭头指示 -->
        <div class="p-1 text-claude-subtle">
          <ChevronDown
            class="w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-180': action.isExpanded }"
          />
        </div>
      </div>
    </div>

    <!-- ================= 展开后的详细参数配置 ================= -->
    <div
      v-if="action.isExpanded"
      class="px-5 py-3 border-t border-claude-border bg-claude-surface/50 space-y-3"
    >
      <!-- 1. 动作分类类型 -->
      <div class="flex flex-col mb-1 w-64">
        <label class="block text-xs font-medium text-claude-muted mb-1">
          更改动作分类类型 <span class="text-claude-subtle text-[11px]">(点击唤起完整动作库)</span>
        </label>
        <ActionCascadeMenu
          :model-value="action.type"
          @select="changeActionType"
        />
      </div>

      <!-- 2. 各动作类型专属参数配置子组件 -->
      <ActionSpecificParams
        :action="action"
        @pick-point="pickMaskPoint"
      />

      <!-- 3. 本地识别 限制区域配置子组件 (仅识别定位类动作显示) -->
      <ActionLimitConfig
        v-if="isRecognitionAction"
        :action="action"
        :index="index"
        :previous-steps="previousSteps"
      />

      <!-- 4. 底部配置行：等待时间 + 失败重试 -->
      <div class="pt-2 border-t border-claude-border grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label class="block text-[11px] text-claude-muted mb-1">后置等待 (秒)</label>
          <input
            v-model.number="action.customWaitSeconds"
            type="number"
            step="0.1"
            min="0"
            placeholder="全局默认"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-claude-bg border border-claude-border text-claude-text placeholder-claude-subtle focus:outline-none focus:border-claude-terracotta font-mono"
          />
        </div>
        <div>
          <label class="block text-[11px] text-claude-muted mb-1">失败重试次数</label>
          <input
            v-model.number="action.retryCount"
            type="number"
            step="1"
            min="0"
            max="20"
            placeholder="0"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-claude-bg border border-claude-border text-claude-text placeholder-claude-subtle focus:outline-none focus:border-claude-terracotta font-mono"
          />
        </div>
        <div>
          <label class="block text-[11px] text-claude-muted mb-1">重试间隔 (秒)</label>
          <input
            v-model.number="action.retryWaitSeconds"
            type="number"
            step="0.1"
            min="0"
            placeholder="1.0"
            :disabled="!action.retryCount"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-claude-bg border border-claude-border text-claude-text placeholder-claude-subtle focus:outline-none focus:border-claude-terracotta font-mono disabled:opacity-40"
          />
        </div>
        <span class="text-[10px] text-claude-subtle pb-1">
          {{ action.retryCount ? `失败后重试 ${action.retryCount} 次 (间隔 ${action.retryWaitSeconds ?? 1.0}s)` : '失败不重试' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const getActionBehaviorLabel = (type: string): string => {
  if (type.startsWith('click_')) return '点击';
  if (type.startsWith('identify_')) return '识别';
  if (type.startsWith('drag_')) return '拖拽';
  if (type.includes('input')) return '输入';
  if (type === 'delay') return '延时';
  if (type === 'scroll') return '滚动';
  return '动作';
};

import {
  ChevronDown,
  ChevronUp,
  Play,
  Loader2,
  Crosshair,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Minus,
  Clock,
  GripVertical
} from 'lucide-vue-next';
import ActionCascadeMenu from './ActionCascadeMenu.vue';
import ActionLimitConfig from './ActionLimitConfig.vue';
import ActionSpecificParams from './ActionSpecificParams.vue';
import type {
  ScriptAction,
  ClickPositionAction,
  ClickTextAction,
  DragLineAction,
  DragCurveAction,
  ScrollAction,
  InputAction,
  SendKeyAction,
  ActionType
} from '../types/script';
import {
  getActionDefaultTitle,
  getActionIcon,
  getActionIconBadgeClass,
  getActionCategoryLabel,
  getButtonLabel,
  getRegionScopeBadge
} from '../utils/actionHelpers';
import {
  scriptStore,
  createDefaultAction
} from '../stores/scriptStore';
import { maskStore } from '../stores/maskStore';
import { automationController } from '../services/automationController';
import {
  stepResults, stepTimings, type StepStatus
} from '../stores/scriptRunner';

const props = defineProps<{
  action: ScriptAction;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}>();

defineEmits<{
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'delete'): void;
}>();

const isTestingStep = ref(false);
const isLocatingStep = ref(false);

// 确保 regionScope 初始化 (默认为全蒙版 0, 0, 0, 0)
if (!props.action.regionScope) {
  props.action.regionScope = {
    baseType: 'mask',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  };
}

// 单步测试：直接调用 automationController.testStepTarget
const handleTestStep = async () => {
  if (isTestingStep.value) return;
  isTestingStep.value = true;
  try {
    const targetApp = scriptStore.editingScript.value?.targetApp;
    const allActions = scriptStore.editingScript.value?.actions || [];
    const res = await automationController.testStepTarget(
      props.action,
      props.index,
      targetApp,
      allActions
    );
    if (!res.success) {
      alert(`❌ 测试失败！\n\n${res.message}\n\n💡 请确保目标应用已处于前台，且目标元素在限制区域内清晰可见。`);
    }
  } catch (err: any) {
    alert(`❌ 测试遇到异常: ${err?.message || err}`);
  } finally {
    isTestingStep.value = false;
  }
};

// 单步纯定位：直接调用 automationController.locateStepTarget
const handleLocateStep = async () => {
  if (isLocatingStep.value) return;
  isLocatingStep.value = true;
  try {
    const targetApp = scriptStore.editingScript.value?.targetApp;
    const allActions = scriptStore.editingScript.value?.actions || [];
    const res = await automationController.locateStepTarget(
      props.action,
      props.index,
      targetApp,
      allActions
    );
    if (!res.success) {
      alert(`❌ 定位失败: ${res.message}`);
    }
  } catch (err: any) {
    alert(`❌ 定位遇到异常: ${err?.message || err}`);
  } finally {
    isLocatingStep.value = false;
  }
};

// 当前脚本的全局默认等待时间
const currentDefaultWait = computed(() => {
  return scriptStore.editingScript.value?.config?.defaultWaitSeconds ?? 1.0;
});

// 是否为支持屏幕识别或位置定位的动作
const isRecognitionAction = computed(() => {
  return (
    props.action.type.startsWith('click_') ||
    props.action.type === 'identify_text' ||
    props.action.type === 'identify_image' ||
    props.action.type === 'identify_color' ||
    props.action.type === 'identify_node' ||
    props.action.type.startsWith('wait_text')
  );
});

// 前序步骤列表
const previousSteps = computed(() => {
  return scriptStore.editingScript.value?.actions.slice(0, props.index) || [];
});

// 是否为当前正在执行的动作
const isCurrentRunning = computed(() => {
  return (
    scriptStore.executionStatus.value === 'running' &&
    scriptStore.currentStepIndex.value === props.index
  );
});

const stepStatus = computed<StepStatus | null>(() => {
  return stepResults.get(props.index) ?? null;
});

const stepDuration = computed(() => {
  const t = stepTimings.get(props.index);
  if (!t || !t.durationMs) return null;
  const ms = t.durationMs;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
});

// 切换展开/收起
const toggleExpand = () => {
  props.action.isExpanded = !props.action.isExpanded;
};

// 切换启用/禁用
const toggleEnabled = () => {
  props.action.isEnabled = !props.action.isEnabled;
};

// 切换动作类型
const changeActionType = (newType: ActionType) => {
  if (props.action.type === newType) return;
  const currentRegionScope = props.action.regionScope || { baseType: 'mask' };
  const templ = createDefaultAction(newType);

  const originalName = props.action.name;
  const originalWait = props.action.customWaitSeconds;
  const originalEnabled = props.action.isEnabled;

  Object.keys(props.action).forEach(key => {
    if (key !== 'id' && key !== 'isExpanded') {
      delete (props.action as any)[key];
    }
  });

  Object.assign(props.action, templ, {
    name: originalName || templ.name,
    customWaitSeconds: originalWait,
    isEnabled: originalEnabled,
    regionScope: currentRegionScope
  });
};

// 启动蒙版拾取点坐标
const pickMaskPoint = async (targetField: string) => {
  await maskStore.startPointPicking({
    actionId: props.action.id,
    targetField,
    actionName: props.action.name
  });
};
</script>

<style scoped>
.action-row-connected::after {
  content: '';
  position: absolute;
  left: 1.65rem;
  bottom: -0.625rem;
  width: 1px;
  height: 0.625rem;
  background: #383430;
}
</style>
