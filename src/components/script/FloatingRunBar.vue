<template>
  <div class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 select-none">
    <!-- 执行完成摘要卡片 -->
    <Transition name="summary-fade">
      <div
        v-if="showSummary"
        class="px-4 py-3 rounded-2xl bg-[#18181b]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/80 text-xs min-w-[220px] cursor-pointer"
        @click="$emit('open-log')"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-claude-text text-[13px]">执行摘要</span>
          <button @click.stop="showSummary = false" class="text-claude-muted hover:text-claude-text cursor-pointer">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mb-2">
          <div>
            <div class="text-emerald-400 font-bold text-sm">{{ summaryData.success }}</div>
            <div class="text-claude-subtle">成功</div>
          </div>
          <div>
            <div class="text-red-400 font-bold text-sm">{{ summaryData.failed }}</div>
            <div class="text-claude-subtle">失败</div>
          </div>
          <div>
            <div class="text-claude-muted font-bold text-sm">{{ summaryData.skipped }}</div>
            <div class="text-claude-subtle">跳过</div>
          </div>
        </div>
        <div class="flex items-center justify-between text-claude-subtle border-t border-white/5 pt-1.5">
          <span>{{ summaryData.loops }} 轮 · {{ summaryData.totalSteps }} 步</span>
          <span>{{ summaryData.duration }}</span>
        </div>
      </div>
    </Transition>

    <!-- 运行中进度条 -->
    <Transition name="summary-fade">
      <div
        v-if="isActive && !showSummary"
        class="px-3 py-1.5 rounded-xl bg-[#18181b]/90 backdrop-blur-xl border border-white/10 shadow-lg text-[11px] text-claude-muted flex items-center gap-2.5 min-w-[180px]"
      >
        <Loader2 v-if="scriptStore.executionStatus.value === 'running'" class="w-3 h-3 animate-spin text-claude-terracotta shrink-0" />
        <PauseCircle v-else-if="scriptStore.executionStatus.value === 'paused'" class="w-3 h-3 text-amber-400 shrink-0" />
        <span class="whitespace-nowrap">
          步骤 {{ currentStep }}/{{ totalSteps }}
          <span v-if="totalLoops !== 1" class="ml-1.5 text-claude-subtle">
            轮次 {{ scriptStore.currentLoop.value }}/{{ totalLoops === 0 ? '∞' : totalLoops }}
          </span>
        </span>
        <div class="flex-1 h-1 rounded-full bg-white/5 overflow-hidden min-w-[40px]">
          <div class="h-full rounded-full bg-claude-terracotta transition-all duration-300" :style="{ width: progressPct + '%' }" />
        </div>
      </div>
    </Transition>

    <!-- 未运行状态：单独呈现大号胶囊 -->
    <button
      v-if="scriptStore.executionStatus.value === 'idle'"
      @click="$emit('run')"
      :disabled="!script?.actions?.length || !isWindowBound"
      class="flex items-center gap-2.5 px-6 py-3 rounded-full bg-claude-terracotta hover:bg-claude-terracotta-hover text-white font-semibold text-sm shadow-2xl shadow-black/60 border border-white/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
      :title="!isWindowBound ? '请先绑定目标窗口' : ''"
    >
      <Play class="w-4 h-4 fill-white" />
      <span>运行脚本</span>
    </button>

    <!-- 运行中/停止中/暂停 状态下的胶囊 Dock -->
    <div
      v-else
      class="flex items-center gap-2 p-1.5 rounded-full bg-[#18181b]/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/80"
    >
      <template v-if="scriptStore.executionStatus.value === 'running' || scriptStore.executionStatus.value === 'stopped' || scriptStore.executionStatus.value === 'stopping'">
        <button
          v-if="scriptStore.executionStatus.value === 'running'"
          @click="scriptStore.pauseScript"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-all active:scale-95 cursor-pointer"
        >
          <Pause class="w-3.5 h-3.5 fill-zinc-950" />
          <span>暂停</span>
        </button>
        <button
          @click="$emit('stop')"
          :disabled="scriptStore.executionStatus.value === 'stopped' || scriptStore.executionStatus.value === 'stopping'"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Square class="w-3.5 h-3.5 fill-white" />
          <span>{{ scriptStore.executionStatus.value === 'stopped' ? '已停止' : scriptStore.executionStatus.value === 'stopping' ? '停止中...' : '停止' }}</span>
        </button>
      </template>

      <template v-else-if="scriptStore.executionStatus.value === 'paused'">
        <button
          @click="scriptStore.resumeScript"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all active:scale-95 cursor-pointer"
        >
          <Play class="w-3.5 h-3.5 fill-zinc-950" />
          <span>继续</span>
        </button>
        <button
          @click="$emit('stop')"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
        >
          <Square class="w-3.5 h-3.5 fill-white" />
          <span>停止</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Play, Pause, Square, X, Loader2, PauseCircle } from 'lucide-vue-next';
import { scriptStore } from '../../stores/scriptStore';
import {
  currentStepIndex, currentLoop, totalEnabledSteps, totalRepeatTarget,
  stepResults, runStartMs, runEndMs, type StepStatus
} from '../../stores/scriptRunner';

defineProps<{ script: any; isWindowBound: boolean }>();
defineEmits(['run', 'stop', 'open-log']);

const isActive = computed(() => {
  const s = scriptStore.executionStatus.value;
  return s === 'running' || s === 'paused' || s === 'stopping';
});

const currentStep = computed(() => Math.max(0, currentStepIndex.value + 1));
const totalSteps = computed(() => totalEnabledSteps.value);
const totalLoops = computed(() => totalRepeatTarget.value);
const progressPct = computed(() => totalSteps.value > 0 ? Math.round((currentStep.value / totalSteps.value) * 100) : 0);

const showSummary = ref(false);

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m${s}s`;
};

const summaryData = computed(() => {
  let success = 0, failed = 0, skipped = 0, dryRun = 0;
  stepResults.forEach((status: StepStatus) => {
    if (status === 'success') success++;
    else if (status === 'failed') failed++;
    else if (status === 'skipped') skipped++;
    else if (status === 'dry_run') { success++; dryRun++; }
  });
  const dur = runEndMs.value > 0 ? runEndMs.value - runStartMs.value : 0;
  return {
    success, failed, skipped, dryRun,
    totalSteps: success + failed + dryRun,
    loops: currentLoop.value,
    duration: formatDuration(dur)
  };
});

watch(() => scriptStore.executionStatus.value, (newVal, oldVal) => {
  if ((newVal === 'completed' || newVal === 'stopped') && (oldVal === 'running' || oldVal === 'paused' || oldVal === 'stopping')) {
    showSummary.value = true;
  }
  if (newVal === 'running' && oldVal === 'idle') {
    showSummary.value = false;
  }
});
</script>

<style scoped>
.summary-fade-enter-active,
.summary-fade-leave-active {
  transition: all 0.2s ease;
}
.summary-fade-enter-from,
.summary-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
