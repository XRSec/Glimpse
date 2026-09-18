<template>
  <!-- 最外层透明窗口视口：0 内边距，四条边框 100% 紧贴窗口四壁，杜绝任何像素间隙错位 -->
  <div class="w-screen h-screen bg-transparent select-none overflow-hidden font-sans relative p-0 m-0 box-border">
    <!-- ================= 1. 外层大框：【脚本运行区域】 (完全对标截图 4) ================= -->
    <div
      class="w-full h-full border-2 border-zinc-500/80 bg-white/[0.02] relative overflow-hidden shadow-[inset_0_0_20px_0_rgba(0,0,0,0.4)]"
      :class="isSelectingLimit ? 'ring-1 ring-blue-500/40' : ''"
      ref="runAreaRef"
    >
      <!-- 顶部刘海：吸附于运行区域上边缘中央，支持高灵敏平滑拖动 -->
      <div
        @mousedown="onNotchMouseDown"
        class="pointer-events-auto absolute top-0 left-1/2 -translate-x-1/2 z-40 flex items-center justify-between px-4 py-1.5 bg-black/70 backdrop-blur-md text-white border-b border-x border-zinc-600/80 rounded-b-lg shadow-xl select-none cursor-move"
      >
        <span class="text-xs font-semibold tracking-wide text-zinc-100 max-w-[200px] truncate select-none pointer-events-none">
          {{ currentScriptTitle || '脚本运行区域' }}
        </span>

        <div class="flex items-center gap-1 pl-2" @mousedown.stop.prevent>
          <button
            type="button"
            @click.stop.prevent="toggleMenu"
            @mousedown.stop.prevent="toggleMenu"
            class="p-1 rounded hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="菜单选项"
          >
            <MoreVertical class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 右下角缩放手柄图标 (对标截图 4: ⤡ 标识) -->
      <div class="pointer-events-auto absolute bottom-1 right-1 text-zinc-400/60 select-none">
        <Maximize2 class="w-3.5 h-3.5 rotate-90" />
      </div>

      <!-- 三点下拉菜单弹窗 -->
      <div
        v-if="showMenu"
        class="pointer-events-auto absolute top-10 left-1/2 -translate-x-1/2 z-50 w-44 py-1.5 rounded-xl bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-xl text-xs text-zinc-200"
        @mousedown.stop
      >
        <button
          @click.stop="handleMenuAction('variables')"
          class="w-full px-3 py-1.5 text-left hover:bg-blue-600/30 hover:text-white flex items-center gap-2 cursor-pointer"
        >
          <Eye class="w-3.5 h-3.5 text-blue-400" />
          <span>查看变量</span>
        </button>
        <button
          @click.stop="handleMenuAction('logs')"
          class="w-full px-3 py-1.5 text-left hover:bg-blue-600/30 hover:text-white flex items-center gap-2 cursor-pointer"
        >
          <ScrollText class="w-3.5 h-3.5 text-emerald-400" />
          <span>查看日志</span>
        </button>
        <div class="my-1 border-t border-zinc-800" />
        <button
          @click.stop="handleMenuAction('close')"
          class="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-2 cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
          <span>关闭运行区域</span>
        </button>
      </div>

      <!-- ================= 2. 内层小框：【限制区域】 (在运行区域大框内部，高对比度清晰高亮) ================= -->
      <div
        v-if="isSelectingLimit || hasActiveLimit"
        class="absolute border-2 border-cyan-400 bg-cyan-500/20 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_25px_rgba(6,182,212,0.6)] outline outline-1 outline-white/80 -outline-offset-2 transition-none select-none z-30"
        :class="isSelectingLimit ? 'pointer-events-auto cursor-move' : 'pointer-events-none opacity-70 border-dashed border-cyan-400'"
        :style="{
          left: `${limitBoxPct.left}%`,
          top: `${limitBoxPct.top}%`,
          width: `${limitBoxPct.width}%`,
          height: `${limitBoxPct.height}%`
        }"
        @mousedown.stop="isSelectingLimit && startManipulateLimitBox('move', $event)"
      >
        <!-- 选区标签徽章：清晰标识当前选区的像素范围 -->
        <div
          class="absolute -top-6 left-0 px-2 py-0.5 rounded bg-cyan-600/95 text-white text-[10px] font-mono font-bold shadow-md flex items-center gap-1.5 pointer-events-none select-none whitespace-nowrap z-35"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          <span>限制区域 {{ displayLimitPixels }}</span>
        </div>

        <!-- 1. 左上角白色直角标 ⎾ (对标截图 3，加粗清晰) -->
        <div
          class="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-[3.5px] border-l-[3.5px] border-white bg-cyan-500/30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-30 cursor-nwse-resize"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('nw', $event)"
        ></div>

        <!-- 2. 右上角白色直角标 ⏋ -->
        <div
          class="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-[3.5px] border-r-[3.5px] border-white bg-cyan-500/30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-30 cursor-nesw-resize"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('ne', $event)"
        ></div>

        <!-- 3. 左下角白色直角标 ⎿ -->
        <div
          class="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-[3.5px] border-l-[3.5px] border-white bg-cyan-500/30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-30 cursor-nesw-resize"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('sw', $event)"
        ></div>

        <!-- 4. 右下角白色直角标 ⏌ (对标截图 3，加粗清晰) -->
        <div
          class="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-[3.5px] border-r-[3.5px] border-white bg-cyan-500/30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-30 cursor-nwse-resize"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('se', $event)"
        ></div>

        <!-- 四条边缩放拉伸把手 -->
        <div
          class="absolute -top-1.5 left-3 right-3 h-3 cursor-ns-resize hover:bg-cyan-400/30 z-20 transition-colors"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('top', $event)"
        ></div>
        <div
          class="absolute -bottom-1.5 left-3 right-3 h-3 cursor-ns-resize hover:bg-cyan-400/30 z-20 transition-colors"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('bottom', $event)"
        ></div>
        <div
          class="absolute top-3 bottom-3 -left-1.5 w-3 cursor-ew-resize hover:bg-cyan-400/30 z-20 transition-colors"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('left', $event)"
        ></div>
        <div
          class="absolute top-3 bottom-3 -right-1.5 w-3 cursor-ew-resize hover:bg-cyan-400/30 z-20 transition-colors"
          @mousedown.stop="isSelectingLimit && startManipulateLimitBox('right', $event)"
        ></div>
      </div>

      <!-- ================= 3. 选区控制浮条 (位于运行区域底部中央，对标截图 3) ================= -->
      <div
        v-if="isSelectingLimit"
        class="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-2 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-xl text-xs select-none"
        @mousedown.stop
      >
        <button
          type="button"
          @click.stop="handleCancelLimitSelection"
          class="px-3.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer active:scale-95"
        >
          取消
        </button>

        <span class="font-mono text-zinc-100 text-xs font-medium tracking-wide">
          {{ displayLimitPixels }}
        </span>

        <button
          type="button"
          @click.stop="handleConfirmLimitSelection"
          class="px-4 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { MoreVertical, Maximize2, Eye, ScrollText, X } from 'lucide-vue-next';
import { scriptStore, isTauriEnv } from '../stores/scriptStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';

const runAreaRef = ref<HTMLElement | null>(null);
const showMenu = ref(false);
const toggleMenu = (e?: Event) => {
  if (e) e.stopPropagation();
  showMenu.value = !showMenu.value;
};

const currentScriptTitle = computed(() => {
  return scriptStore.editingScript.value?.title || '脚本运行区域';
});

// -------------------------------------------------------------
// 运行区域位置与尺寸持久化 (记住最后一次位置与大小，绝不变来变去)
// -------------------------------------------------------------
const GEOMETRY_KEY = 'glimpse_mask_run_area_geometry';

const saveGeometry = async () => {
  if (!isTauriEnv()) return;
  try {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    if (size.width > 120 && size.height > 100) {
      localStorage.setItem(GEOMETRY_KEY, JSON.stringify({
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height
      }));
    }
  } catch (e) {}
};

const restoreGeometry = async () => {
  if (!isTauriEnv()) return;
  try {
    const saved = localStorage.getItem(GEOMETRY_KEY);
    if (saved) {
      const { x, y, width, height } = JSON.parse(saved);
      const win = getCurrentWindow();
      if (width && height) {
        await win.setSize(new PhysicalSize(width, height));
      }
      if (x !== undefined && y !== undefined) {
        await win.setPosition(new PhysicalPosition(x, y));
      }
    }
  } catch (e) {}
};

// 按住刘海时触发窗口移动 (基于真实屏幕绝对位移的平移)
let isDraggingNotch = false;
let lastScreenX = 0;
let lastScreenY = 0;

const onNotchMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.button !== 0) return; // 仅限鼠标左键拖拽
  if (!isTauriEnv()) return;

  isDraggingNotch = true;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;

  const onWindowMove = (ev: MouseEvent) => {
    if (!isDraggingNotch) return;
    const dx = ev.screenX - lastScreenX;
    const dy = ev.screenY - lastScreenY;
    if (dx !== 0 || dy !== 0) {
      lastScreenX = ev.screenX;
      lastScreenY = ev.screenY;
      invoke('move_mask_window', { delta_x: dx, delta_y: dy, deltaX: dx, deltaY: dy }).catch(() => {});
    }
  };

  const onWindowUp = () => {
    if (!isDraggingNotch) return;
    isDraggingNotch = false;
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', onWindowUp);
    saveGeometry();
  };

  window.addEventListener('mousemove', onWindowMove);
  window.addEventListener('mouseup', onWindowUp);
};

// 是否处于选择限制区域模式
const isSelectingLimit = computed(() => {
  return scriptStore.maskInteractionMode.value === 'selecting_limit';
});

// 监听选择限制区域模式及菜单展开状态，联动通知 Rust 内核是否开启穿透 (选区或菜单打开时绝不穿透，退出后恢复动态穿透)
watch([isSelectingLimit, showMenu], async ([selecting, menuOpen]) => {
  if (isTauriEnv()) {
    try {
      await invoke('set_mask_selecting_mode', { selecting: selecting || menuOpen });
    } catch (e) {}
  }
}, { immediate: true });

// 当前是否有生效的限制区域需要展示预览
const hasActiveLimit = ref(false);

// 内层小框相对于外层运行区域大框的相对百分比坐标 [0% ~ 100%]
const limitBoxPct = ref({
  left: 15.0,
  top: 15.0,
  width: 50.0,
  height: 50.0
});

// 根据传入的实际数据初始化选区框，方便用户直接基于现有数据调整
const initBoxFromData = () => {
  const init = scriptStore.maskInteractionContext.value?.initialLimit;
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || 760;
  const parentH = rect?.height || 520;

  if (init && (init.right > init.left || init.bottom > init.top)) {
    const l = Math.max(0, init.left || 0);
    const r = Math.min(parentW, Math.max(l + 20, init.right || 200));
    const t = Math.max(0, init.top || 0);
    const b = Math.min(parentH, Math.max(t + 20, init.bottom || 300));

    const leftPct = (l / parentW) * 100;
    const widthPct = ((r - l) / parentW) * 100;
    const topPct = (t / parentH) * 100;
    const heightPct = ((b - t) / parentH) * 100;

    limitBoxPct.value = {
      left: Math.max(0, Math.min(95, leftPct)),
      top: Math.max(0, Math.min(95, topPct)),
      width: Math.max(5, Math.min(100 - leftPct, widthPct)),
      height: Math.max(5, Math.min(100 - topPct, heightPct))
    };
  } else {
    limitBoxPct.value = {
      left: 15.0,
      top: 15.0,
      width: 50.0,
      height: 50.0
    };
  }
};

// 监听模式开启，自动根据现有数据生成高亮选择框
watch(isSelectingLimit, (selecting) => {
  if (selecting) {
    // 延迟一帧确保 runAreaRef 尺寸已就绪
    setTimeout(() => {
      initBoxFromData();
    }, 50);
  }
}, { immediate: true });

watch(() => scriptStore.maskInteractionContext.value, () => {
  if (isSelectingLimit.value) {
    initBoxFromData();
  }
}, { deep: true });

// 格式化输出显示纯像素：左 x px - 右 x px, 上 y px - 下 y px
const displayLimitPixels = computed(() => {
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || 760;
  const parentH = rect?.height || 520;

  const l = Math.round((limitBoxPct.value.left / 100) * parentW);
  const r = Math.round(((limitBoxPct.value.left + limitBoxPct.value.width) / 100) * parentW);
  const t = Math.round((limitBoxPct.value.top / 100) * parentH);
  const b = Math.round(((limitBoxPct.value.top + limitBoxPct.value.height) / 100) * parentH);

  return `左 ${l}px - 右 ${r}px, 上 ${t}px - 下 ${b}px`;
});

// 选区拖拽调整逻辑 (相对于外层运行区域像素)
let manipMode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'top' | 'bottom' | 'left' | 'right' | null = null;
let startMouseX = 0;
let startMouseY = 0;
let startLeftPct = 0;
let startTopPct = 0;
let startWidthPct = 0;
let startHeightPct = 0;

const startManipulateLimitBox = (mode: typeof manipMode, e: MouseEvent) => {
  manipMode = mode;
  startMouseX = e.clientX;
  startMouseY = e.clientY;
  startLeftPct = limitBoxPct.value.left;
  startTopPct = limitBoxPct.value.top;
  startWidthPct = limitBoxPct.value.width;
  startHeightPct = limitBoxPct.value.height;

  window.addEventListener('mousemove', onManipulateMouseMove);
  window.addEventListener('mouseup', onManipulateMouseUp);
};

const onManipulateMouseMove = (e: MouseEvent) => {
  if (!manipMode || !runAreaRef.value) return;
  const rect = runAreaRef.value.getBoundingClientRect();
  const parentW = rect.width || 1;
  const parentH = rect.height || 1;

  const dxPct = ((e.clientX - startMouseX) / parentW) * 100;
  const dyPct = ((e.clientY - startMouseY) / parentH) * 100;

  if (manipMode === 'move') {
    const maxL = 100 - limitBoxPct.value.width;
    const maxT = 100 - limitBoxPct.value.height;
    limitBoxPct.value.left = Math.max(0, Math.min(maxL, startLeftPct + dxPct));
    limitBoxPct.value.top = Math.max(0, Math.min(maxT, startTopPct + dyPct));
  } else if (manipMode === 'se') {
    limitBoxPct.value.width = Math.max(5, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
    limitBoxPct.value.height = Math.max(5, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
  } else if (manipMode === 'nw') {
    const newW = Math.max(5, startWidthPct - dxPct);
    const newH = Math.max(5, startHeightPct - dyPct);
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - newW));
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - newH));
    limitBoxPct.value.width = newW;
    limitBoxPct.value.height = newH;
  } else if (manipMode === 'ne') {
    const newW = Math.max(5, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
    const newH = Math.max(5, startHeightPct - dyPct);
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - newH));
    limitBoxPct.value.width = newW;
    limitBoxPct.value.height = newH;
  } else if (manipMode === 'sw') {
    const newW = Math.max(5, startWidthPct - dxPct);
    const newH = Math.max(5, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - newW));
    limitBoxPct.value.width = newW;
    limitBoxPct.value.height = newH;
  } else if (manipMode === 'top') {
    const newH = Math.max(5, startHeightPct - dyPct);
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - newH));
    limitBoxPct.value.height = newH;
  } else if (manipMode === 'bottom') {
    limitBoxPct.value.height = Math.max(5, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
  } else if (manipMode === 'left') {
    const newW = Math.max(5, startWidthPct - dxPct);
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - newW));
    limitBoxPct.value.width = newW;
  } else if (manipMode === 'right') {
    limitBoxPct.value.width = Math.max(5, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
  }
};

const onManipulateMouseUp = () => {
  manipMode = null;
  window.removeEventListener('mousemove', onManipulateMouseMove);
  window.removeEventListener('mouseup', onManipulateMouseUp);
};

// 取消选区
const handleCancelLimitSelection = async () => {
  scriptStore.maskInteractionMode.value = 'none';
};

// 确定选区，回填数值到动作限制区域 (以纯像素 px 回填)
const handleConfirmLimitSelection = async () => {
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || 760;
  const parentH = rect?.height || 520;

  const l = Math.round((limitBoxPct.value.left / 100) * parentW);
  const r = Math.round(((limitBoxPct.value.left + limitBoxPct.value.width) / 100) * parentW);
  const t = Math.round((limitBoxPct.value.top / 100) * parentH);
  const b = Math.round(((limitBoxPct.value.top + limitBoxPct.value.height) / 100) * parentH);

  const ctx = scriptStore.maskInteractionContext.value;
  scriptStore.broadcastSync('mask_limit_selected', {
    actionId: ctx.actionId,
    left: l,
    right: r,
    top: t,
    bottom: b,
    unit: 'px'
  });

  scriptStore.maskInteractionMode.value = 'none';
};

// 菜单点击
const handleMenuAction = async (action: string) => {
  showMenu.value = false;
  if (action === 'close') {
    if (isTauriEnv()) {
      await invoke('show_mask_overlay', { show: false });
    }
  }
};

let resizeTimer: any = null;
const onWindowResizeDebounced = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    saveGeometry();
  }, 300);
};

// 彻底禁止任何默认 webview 右键菜单弹出
const preventContextMenu = (e: MouseEvent) => {
  e.preventDefault();
};

onMounted(async () => {
  await restoreGeometry();
  window.addEventListener('resize', onWindowResizeDebounced);
  window.addEventListener('contextmenu', preventContextMenu, true);
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResizeDebounced);
  window.removeEventListener('contextmenu', preventContextMenu, true);
  window.removeEventListener('mousemove', onManipulateMouseMove);
  window.removeEventListener('mouseup', onManipulateMouseUp);
});
</script>
