<template>
  <div class="fixed bottom-6 right-6 z-40 flex items-center select-none">
    <!-- 未运行状态：单独呈现大号胶囊 -->
    <button
      v-if="scriptStore.executionStatus.value === 'idle'"
      @click="$emit('run')"
      :disabled="!script?.actions?.length || !isWindowBound"
      class="flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#da7756] hover:bg-[#e28465] text-white font-semibold text-sm shadow-2xl shadow-black/60 border border-white/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
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
      <!-- 运行中/停止过渡状态控制组合 -->
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

      <!-- 暂停状态控制组合 -->
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
import { Play, Pause, Square } from 'lucide-vue-next';
import { scriptStore } from '../../stores/scriptStore';
defineProps<{ script: any; isWindowBound: boolean }>();
defineEmits(['run', 'stop']);
</script>
