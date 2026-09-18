<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed z-[60] flex flex-col rounded-2xl border border-[#383430] bg-[#1c1a17]/95 backdrop-blur-xl shadow-2xl overflow-hidden font-sans"
      :style="panelStyle"
    >
      <!-- 标题栏（可拖拽） -->
      <div
        class="flex items-center justify-between px-3 py-2 bg-[#262320]/90 border-b border-[#383430] cursor-move shrink-0 select-none"
        @mousedown.prevent="onDragStart"
      >
        <div class="flex items-center gap-2 text-xs font-semibold text-[#d5cdc4]">
          <ScrollText class="w-3.5 h-3.5 text-[#da7756]" />
          <span>运行日志</span>
          <span class="text-[10px] text-[#78716c] font-normal">{{ totalCount }} 条</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            @click="autoScroll = !autoScroll"
            class="p-1 rounded-md transition-colors"
            :class="autoScroll ? 'text-[#da7756] bg-[#da7756]/10' : 'text-[#78716c] hover:text-[#d5cdc4] hover:bg-[#2c2825]'"
            :title="autoScroll ? '自动滚动: 开' : '自动滚动: 关'"
          >
            <ArrowDownToLine class="w-3 h-3" />
          </button>
          <button
            @click="scriptStore.clearLogs()"
            class="p-1 rounded-md text-[#78716c] hover:text-[#d5cdc4] hover:bg-[#2c2825] transition-colors"
            title="清空日志"
          >
            <Trash2 class="w-3 h-3" />
          </button>
          <button
            @click="isMinimized = !isMinimized"
            class="p-1 rounded-md text-[#78716c] hover:text-[#d5cdc4] hover:bg-[#2c2825] transition-colors"
            :title="isMinimized ? '展开' : '最小化'"
          >
            <Minus v-if="!isMinimized" class="w-3 h-3" />
            <Maximize2 v-else class="w-3 h-3" />
          </button>
          <button
            @click="visible = false"
            class="p-1 rounded-md text-[#78716c] hover:text-red-400 hover:bg-[#2c2825] transition-colors"
            title="关闭"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- 日志内容区域 -->
      <div
        v-show="!isMinimized"
        ref="logContainer"
        class="flex-1 overflow-y-auto px-2.5 py-1.5 text-[11px] font-mono leading-[1.6]"
        @scroll="onUserScroll"
      >
        <div v-if="totalCount === 0" class="py-8 text-center text-[#78716c] text-xs">
          暂无日志，运行脚本后自动显示
        </div>
        <template v-else>
          <div v-if="totalCount > MAX_VISIBLE" class="text-center py-1">
            <button
              @click="showAll = true"
              class="text-[10px] text-[#78716c] hover:text-[#da7756] transition-colors"
            >
              还有 {{ totalCount - MAX_VISIBLE }} 条更早的日志，点击加载全部
            </button>
          </div>
          <div
            v-for="log in visibleLogs"
            :key="log.id"
            class="flex gap-2 px-1.5 py-[2px] rounded hover:bg-[#262320]/60"
          >
            <span class="text-[#585350] shrink-0 tabular-nums">{{ log.timestamp }}</span>
            <span class="shrink-0 font-semibold" :class="levelCls(log.level || log.type || 'info')">{{ levelTag(log.level || log.type || 'info') }}</span>
            <span class="text-[#d5cdc4] break-all whitespace-pre-wrap">{{ log.message }}</span>
          </div>
        </template>
      </div>

      <!-- 缩放手柄 -->
      <div
        v-show="!isMinimized"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        @mousedown.prevent="onResizeStart"
      >
        <svg viewBox="0 0 16 16" class="w-full h-full text-[#78716c]/40">
          <path d="M14 14L14 8M14 14L8 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { ScrollText, Trash2, Minus, Maximize2, X, ArrowDownToLine } from 'lucide-vue-next';
import { scriptStore } from '../stores/scriptStore';

const visible = ref(false);
const isMinimized = ref(false);
const autoScroll = ref(true);
const showAll = ref(false);
const logContainer = ref<HTMLElement | null>(null);

const MAX_VISIBLE = 150;

const posX = ref(window.innerWidth - 580);
const posY = ref(window.innerHeight - 420);
const width = ref(540);
const height = ref(360);

const MIN_W = 320;
const MIN_H = 180;

const panelStyle = computed(() => ({
  left: `${posX.value}px`,
  top: `${posY.value}px`,
  width: `${width.value}px`,
  height: isMinimized.value ? 'auto' : `${height.value}px`,
}));

const totalCount = computed(() => scriptStore.logs.value.length);

const visibleLogs = computed(() => {
  const all = scriptStore.logs.value;
  if (all.length === 0) return [];
  const chronological = [...all].reverse();
  if (showAll.value || chronological.length <= MAX_VISIBLE) return chronological;
  return chronological.slice(-MAX_VISIBLE);
});

const levelCls = (level: string) => ({
  'text-[#78716c]': level === 'info',
  'text-emerald-400': level === 'success',
  'text-amber-400': level === 'warn',
  'text-red-400': level === 'error',
});

const levelTag = (level: string) => {
  const map: Record<string, string> = { info: 'INFO', success: ' OK ', warn: 'WARN', error: ' ERR' };
  return `[${map[level] || level.toUpperCase()}]`;
};

const scrollToBottom = async () => {
  await nextTick();
  const el = logContainer.value;
  if (el) el.scrollTop = el.scrollHeight;
};

const onUserScroll = () => {
  const el = logContainer.value;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  autoScroll.value = atBottom;
};

// --- 拖拽 ---
let dragOffset = { x: 0, y: 0 };
let rafId = 0;
const onDragStart = (e: MouseEvent) => {
  dragOffset = { x: e.clientX - posX.value, y: e.clientY - posY.value };
  const onMove = (ev: MouseEvent) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      posX.value = Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - dragOffset.x));
      posY.value = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dragOffset.y));
    });
  };
  const onUp = () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

const onResizeStart = (e: MouseEvent) => {
  const startW = width.value, startH = height.value, startX = e.clientX, startY = e.clientY;
  let resizeRaf = 0;
  const onMove = (ev: MouseEvent) => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      width.value = Math.max(MIN_W, startW + (ev.clientX - startX));
      height.value = Math.max(MIN_H, startH + (ev.clientY - startY));
    });
  };
  const onUp = () => { cancelAnimationFrame(resizeRaf); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

// --- 生命周期 ---
let userClosed = false;

watch(() => scriptStore.executionStatus.value, (status) => {
  if (status === 'running' && !userClosed) {
    visible.value = true;
    isMinimized.value = false;
    autoScroll.value = true;
    showAll.value = false;
  }
  if (status === 'idle') userClosed = false;
});

watch(visible, (v) => {
  if (!v && scriptStore.executionStatus.value !== 'idle') userClosed = true;
});

watch(totalCount, () => {
  if (autoScroll.value && visible.value && !isMinimized.value) scrollToBottom();
});

defineExpose({ show: () => { visible.value = true; userClosed = false; } });
</script>
