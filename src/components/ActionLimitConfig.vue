<template>
  <div class="p-2.5 rounded-xl bg-[#211f1c] border border-[#383430] shadow-sm space-y-2.5">
    <!-- 头部小标题：本地识别 限制区域 -->
    <div class="flex items-center justify-between pb-2 border-b border-[#383430]">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-[#fbfaf8] flex items-center gap-1.5">
          <Scan class="w-3.5 h-3.5 text-[#da7756]" />
          本地识别 限制区域
        </span>
        <span class="text-[10px] px-1.5 py-0.2 rounded bg-[#da7756]/15 border border-[#da7756]/30 text-[#da7756]">
          精确范围查找
        </span>
      </div>
      <span class="text-[11px] text-[#a8a29e]">
        限制查找文字或目标的屏幕区域范围，大幅提升识别速度
      </span>
    </div>

    <!-- 基于基准下拉框 + 单独的定位按钮 -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-[#a8a29e] whitespace-nowrap">基于基准：</span>
        <select
          v-model="selectedBaseKey"
          class="px-2.5 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] focus:border-[#da7756] cursor-pointer"
        >
          <option value="mask">基于脚本运行蒙版 (默认)</option>
          <option v-for="(pStep, pIdx) in previousSteps" :key="pStep.id" :value="'step_' + pIdx">
            基于步骤 #{{ pIdx + 1 }}: {{ pStep.name }} 的点击位置
          </option>
        </select>
      </div>

      <!-- 若基于前序步骤：只多了一个定位按钮，单纯定位基准 -->
      <button
        v-if="action.regionScope?.baseType === 'step'"
        type="button"
        @click="handleLocateStep"
        :disabled="isLocating"
        class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#da7756]/15 hover:bg-[#da7756]/25 text-[#da7756] border border-[#da7756]/30 hover:border-[#da7756]/60 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60 shrink-0"
        title="在屏幕蒙版上标记该基准步骤命中位置（绿色方框+准星），蒙版保持穿透"
      >
        <Crosshair class="w-3.5 h-3.5" :class="{ 'animate-spin': isLocating }" />
        <span>{{ isLocating ? '定位中...' : `定位基准步骤 #${(action.regionScope.targetStepIndex ?? 0) + 1}` }}</span>
      </button>
    </div>

    <!-- 四列纯数值 px 输入框：左、右、上、下 -->
    <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
      <div v-for="field in limitFields" :key="field.key" class="w-24">
        <div class="text-[11px] text-[#a8a29e] text-center mb-1">{{ field.label }}</div>
        <div class="relative">
          <input
            v-model.number="scope[field.key]"
            type="number"
            
            :placeholder="action.regionScope?.baseType === 'mask' ? '蒙版区域' : field.placeholder"
            :class="['w-full pl-2 pr-6 py-1.5 text-xs rounded-lg text-center font-mono focus:outline-none bg-[#191716] border-[#383430] text-[#fbfaf8] focus:border-[#da7756]']"
          />
          <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-[#78716c] select-none">px</span>
        </div>
      </div>

      <!-- 右侧按钮组：选区、清除、提示 -->
      <div class="flex items-center gap-1.5 sm:pt-4">
        <button type="button" @click="startSelectLimitRegion" class="p-2 rounded-lg bg-[#da7756]/15 hover:bg-[#da7756]/25 text-[#da7756] border border-[#da7756]/30 hover:border-[#da7756]/60 transition-all active:scale-95 cursor-pointer shadow-sm" :title="action.regionScope?.baseType === 'step' ? '在蒙版上拉拽框选限制区域' : '在屏幕蒙版中拉拽框选矩形区域'">
          <Crop class="w-4 h-4 text-[#da7756]" />
        </button>
        <button type="button" @click="clearLimitRegion" class="p-2 rounded-lg bg-[#211f1c] hover:bg-[#2c2825] text-[#a8a29e] hover:text-red-400 border border-[#383430] transition-all active:scale-95 cursor-pointer" title="清空重置限制区域">
          <XCircle class="w-4 h-4" />
        </button>
        <HelpTip :title="action.regionScope?.baseType === 'step' ? '基于相对基准步骤' : '基于蒙版绝对物理区域'" :text="limitDescriptionText" />
      </div>
    </div>

    <!-- 提示小字 -->
    <div class="text-[11px] text-[#78716c] pt-0.5">
      {{ limitDescriptionText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import HelpTip from './common/HelpTip.vue';
import { Scan, Crosshair, Crop, XCircle } from 'lucide-vue-next';
import type { ScriptAction } from '../types/script';
import { automationController } from '../services/automationController';
import { scriptStore } from '../stores/scriptStore';
import { maskStore } from '../stores/maskStore';

const props = defineProps<{
  action: ScriptAction;
  index: number;
  previousSteps: ScriptAction[];
}>();

const isLocating = ref(false);

const ensureRegionScope = () => {
  if (!props.action.regionScope) {
    props.action.regionScope = { baseType: 'mask', left: 0, right: 0, top: 0, bottom: 0 };
  }
};

const scope = computed(() => {
  ensureRegionScope();
  return props.action.regionScope!;
});

const limitFields = computed(() => [
  { key: 'left' as const, label: '左 (px)', placeholder: '0' },
  { key: 'right' as const, label: '右 (px)', placeholder: props.action.regionScope?.baseType === 'step' ? '200' : '0' },
  { key: 'top' as const, label: '上 (px)', placeholder: '0' },
  { key: 'bottom' as const, label: '下 (px)', placeholder: props.action.regionScope?.baseType === 'step' ? '300' : '0' }
]);

const selectedBaseKey = computed({
  get: () => props.action.regionScope?.baseType === 'step' ? `step_${props.action.regionScope.targetStepIndex ?? 0}` : 'mask',
  set: (val: string) => {
    ensureRegionScope();
    if (val.startsWith('step_')) {
      const sIdx = parseInt(val.replace('step_', ''), 10);
      props.action.regionScope!.baseType = 'step';
      props.action.regionScope!.targetStepIndex = isNaN(sIdx) ? 0 : sIdx;
      if (props.action.regionScope!.right === undefined && props.action.regionScope!.bottom === undefined) {
        Object.assign(props.action.regionScope!, { left: 0, right: 200, top: 0, bottom: 300 });
      }
    } else {
      props.action.regionScope!.baseType = 'mask';
      props.action.regionScope!.targetStepIndex = undefined;
    }
  }
});

const limitDescriptionText = computed(() => {
  if (props.action.regionScope?.baseType === 'step') {
    const sIdx = (props.action.regionScope.targetStepIndex ?? 0) + 1;
    return `以【步骤 #${sIdx}】点击坐标为基准原点，向左 ${props.action.regionScope.left ?? 0}px、向右 ${props.action.regionScope.right ?? 200}px、向上 ${props.action.regionScope.top ?? 0}px、向下 ${props.action.regionScope.bottom ?? 300}px 框定范围识别`;
  }
  return '以脚本运行蒙版为基准，向内限制在左、右、上、下像素矩形范围识别，大幅提升识别速度';
});

const clearLimitRegion = () => {
  if (props.action.regionScope) {
    Object.assign(props.action.regionScope, { left: 0, right: 0, top: 0, bottom: 0 });
  }
};

const handleLocateStep = async () => {
  ensureRegionScope();
  if (isLocating.value) return;
  isLocating.value = true;
  try {
    const targetApp = scriptStore.editingScript.value?.targetApp;
    const allActions = scriptStore.editingScript.value?.actions || [];
    const res = await automationController.locateStepTarget(props.action, props.index, targetApp, allActions);
    if (!res.success) {
      alert(`定位基准步骤失败: ${res.message}`);
    }
  } catch (err: any) {
    alert(`定位基准步骤遇到异常: ${err?.message || err}`);
  } finally {
    isLocating.value = false;
  }
};

const startSelectLimitRegion = async () => {
  ensureRegionScope();
  const targetApp = scriptStore.editingScript.value?.targetApp;
  if (targetApp) {
    await automationController.ensureMaskAlignedToTargetApp(targetApp, false);
  } else {
    await maskStore.setVisible(true);
  }

  const s = props.action.regionScope!;
  const isStepBase = s.baseType === 'step';
  const targetStepIndex = isStepBase ? (s.targetStepIndex ?? 0) : undefined;

  await maskStore.startLimitSelection({
    actionId: props.action.id,
    actionName: props.action.name,
    targetStepIndex,
    initialLimit: {
      left: Number(s.left) || 0,
      right: Number(s.right) || 0,
      top: Number(s.top) || 0,
      bottom: Number(s.bottom) || 0
    }
  });
};
</script>
