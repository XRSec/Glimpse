<template>
  <div class="w-screen h-screen bg-transparent select-none overflow-hidden font-sans relative p-0 m-0 box-border">
    <!-- 脚本运行区域主框 -->
    <div
      class="w-full h-full border-2 border-stone-500/70 bg-transparent relative overflow-hidden"
      :class="isSelectingLimit ? 'ring-1 ring-[#da7756]/50' : ''"
      ref="runAreaRef"
    >
      <!-- 顶部可拖拽刘海 (Claude 暖炭黑) -->
      <div
        @mousedown="onNotchMouseDown"
        class="pointer-events-auto absolute top-0 left-1/2 -translate-x-1/2 z-40 flex items-center justify-between px-4 py-1.5 bg-[#211f1c]/95 backdrop-blur-md text-[#fbfaf8] border-b border-x border-[#383430] rounded-b-xl shadow-2xl select-none cursor-move"
      >
        <div class="flex items-center gap-2">
          <span v-if="scriptStore.isRecording.value" class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          <span class="text-xs font-semibold tracking-wide text-[#fbfaf8] max-w-[170px] truncate select-none pointer-events-none">
            {{ scriptStore.isRecording.value ? '🔴 智能录制中...' : (currentScriptTitle || '脚本运行区域') }}
          </span>
          <span
            v-if="targetAppName"
            class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 max-w-[130px] truncate"
            :title="`已锁定目标: ${targetAppName} (${targetAppBounds})`"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span class="truncate">{{ targetAppName }}</span>
          </span>
        </div>

        <div class="flex items-center gap-1 pl-2" @pointerdown.stop @mousedown.stop>
          <button
            type="button"
            @click.stop="toggleMenu"
            class="p-1 rounded-lg hover:bg-[#383430] text-[#a8a29e] hover:text-[#fbfaf8] transition-colors cursor-pointer"
            title="菜单选项"
          >
            <MoreVertical class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 右下角缩放手柄 -->
      <div
        @mousedown.stop="onResizeHandleMouseDown"
        class="pointer-events-auto absolute bottom-0 right-0 p-2 cursor-nwse-resize text-[#a8a29e]/60 hover:text-white transition-colors select-none z-40 group"
        title="拖动调整蒙版尺寸"
      >
        <Maximize2 class="w-3.5 h-3.5 rotate-90 group-hover:scale-110 transition-transform" />
      </div>

      <!-- 菜单与背景遮罩 -->
      <div v-if="showMenu" class="pointer-events-auto fixed inset-0 z-45 bg-black/[0.01]" @pointerdown.stop="showMenu = false" />
      <div
        v-if="showMenu"
        class="pointer-events-auto absolute top-10 left-1/2 -translate-x-1/2 z-50 w-52 py-1.5 rounded-2xl bg-[#262320]/95 border border-[#383430] shadow-2xl backdrop-blur-xl text-xs text-[#fbfaf8]"
        @click.stop
      >
        <button
          v-if="hasTargetApp"
          @click.stop="handleMenuAction('snap_app')"
          class="w-full px-3.5 py-2 text-left hover:bg-emerald-600/25 text-emerald-300 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
        >
          <AppWindow class="w-3.5 h-3.5 text-emerald-400" />
          <span>贴合目标 App 窗口</span>
        </button>
        <button
          @click.stop="handleMenuAction('detect_app')"
          class="w-full px-3.5 py-2 text-left hover:bg-[#da7756]/20 hover:text-[#fbfaf8] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Crosshair class="w-3.5 h-3.5 text-[#da7756]" />
          <span>感知当前前台 App</span>
        </button>
        <div class="my-1 border-t border-[#383430]" />
        <button
          @click.stop="handleMenuAction('close')"
          class="w-full px-3.5 py-2 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <X class="w-3.5 h-3.5" />
          <span>关闭运行区域</span>
        </button>
      </div>

      <!-- 拾取坐标点交互遮罩 -->
      <div
        v-if="isPickingPoint"
        class="absolute inset-0 z-40 bg-[#da7756]/10 hover:bg-[#da7756]/15 cursor-crosshair pointer-events-auto flex items-end justify-center pb-6 select-none transition-colors"
        @mousemove="onPickingMouseMove"
        @click.stop="onPickPointClick"
      >
        <div class="flex items-center gap-3 px-5 py-2 rounded-full bg-[#211f1c]/95 border border-[#da7756]/60 shadow-2xl backdrop-blur-xl text-xs text-[#fbfaf8]" @click.stop>
          <Crosshair class="w-4 h-4 text-[#da7756] animate-pulse" />
          <span>🎯 在区域内点击任意目标位置以拾取坐标</span>
          <span v-if="hoverCoord" class="px-2 py-0.5 rounded bg-[#da7756]/20 text-[#da7756] font-mono text-[11px] font-bold border border-[#da7756]/30">
            X: {{ hoverCoord.x }}, Y: {{ hoverCoord.y }}
          </span>
          <button
            type="button"
            @click.stop="handleCancelPickPoint"
            class="px-2.5 py-0.5 rounded-full bg-[#2e2a27] hover:bg-[#383430] text-[#a8a29e] text-[11px] font-medium transition-colors cursor-pointer"
          >
            取消 (ESC)
          </button>
        </div>
      </div>

      <!-- 限制区域矩形与目标位置矩形绘制层 (支持截屏瞬间闪避) -->
      <template v-if="areRectsVisible">
        <!-- 0. 基准步骤限制区域矩形 (基于条件的限制区域，紫/青色虚线框，常驻屏幕，选区与定位皆保留) -->
        <div
          v-if="baseRoiBox"
          class="absolute pointer-events-none z-15"
          :style="{
            left: `${baseRoiBox.left}px`,
            top: `${baseRoiBox.top}px`,
            width: `${baseRoiBox.width}px`,
            height: `${baseRoiBox.height}px`
          }"
        >
          <div class="relative w-full h-full border-2 border-dashed border-violet-400/80 bg-violet-500/10 rounded shadow-[0_0_12px_rgba(167,139,250,0.25)]">
            <div class="absolute top-1 left-1.5 px-2 py-0.5 rounded bg-violet-950/90 text-violet-200 text-[10px] font-mono whitespace-nowrap border border-violet-400/50 shadow">
              {{ baseRoiBox.label }}
            </div>
          </div>
        </div>

        <!-- 1. 运行/测试/定位命中绿框与准星锚点 (常驻屏幕，选区时亦高亮引导) -->
        <div
          v-if="runHitAnchorBox"
          class="absolute pointer-events-none z-25"
          :style="{
            left: `${runHitAnchorBox.left}px`,
            top: `${runHitAnchorBox.top}px`,
            width: `${runHitAnchorBox.width}px`,
            height: `${runHitAnchorBox.height}px`
          }"
        >
          <div class="relative w-full h-full border-2 border-emerald-400/90 bg-emerald-400/20 rounded shadow-[0_0_12px_rgba(52,211,153,0.6)]">
            <div class="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-emerald-300"></div>
            <div class="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-emerald-300"></div>
            <div class="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-emerald-300"></div>
            <div class="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-emerald-300"></div>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
              <span class="block w-2.5 h-2.5 rounded-full bg-emerald-300 border border-emerald-600 shadow-[0_0_6px_rgba(52,211,153,0.9)]"></span>
              <span class="absolute w-5 h-0.5 bg-emerald-400"></span>
              <span class="absolute h-5 w-0.5 bg-emerald-400"></span>
            </div>
          </div>
          <div class="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#1a1a1a]/90 text-emerald-300 text-[10px] font-mono whitespace-nowrap border border-emerald-500/40 shadow-lg">
            #{{ (maskStore.runHitAnchor.value?.stepIndex ?? 0) + 1 }} {{ maskStore.runHitAnchor.value?.stepName }}
          </div>
        </div>

        <!-- 2. 定位与测试预览：当前步骤限制区域矩形 (蓝色虚线框，先画后识别) -->
        <div
          v-if="previewLimitBox && !isSelectingLimit"
          class="absolute pointer-events-none z-20"
          :style="{
            left: `${previewLimitBox.left}px`,
            top: `${previewLimitBox.top}px`,
            width: `${previewLimitBox.width}px`,
            height: `${previewLimitBox.height}px`
          }"
        >
          <div class="relative w-full h-full border-2 border-dashed border-sky-400 rounded">
            <div class="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-sky-300"></div>
            <div class="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-sky-300"></div>
            <div class="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-sky-300"></div>
            <div class="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-sky-300"></div>
            <div class="absolute top-1 left-1.5 px-2 py-0.5 rounded bg-sky-900/90 text-sky-200 text-[10px] font-mono whitespace-nowrap border border-sky-400/50 shadow">
              {{ previewLimitBox.label }}
            </div>
          </div>
        </div>
      </template>

      <!-- 4. 交互框选限制区域 (珊瑚橙) -->
      <div
        v-if="isSelectingLimit"
        class="absolute border-2 border-[#da7756] bg-[#da7756]/15 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_25px_rgba(218,119,86,0.5)] outline outline-1 outline-white/80 -outline-offset-2 transition-none select-none z-30 pointer-events-auto cursor-move"
        :style="{
          left: `${limitBoxPct.left}%`,
          top: `${limitBoxPct.top}%`,
          width: `${limitBoxPct.width}%`,
          height: `${limitBoxPct.height}%`
        }"
        @mousedown.stop="startManipulateLimitBox('move', $event)"
      >
        <div class="absolute -top-7 left-0 px-2.5 py-0.5 rounded-lg bg-[#da7756] text-white text-[10px] font-mono font-bold shadow-lg flex items-center gap-1.5 pointer-events-none select-none whitespace-nowrap z-35">
          <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          <span>{{ displayLimitPixels }}</span>
        </div>
        <!-- 4角把手 -->
        <div class="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-[3.5px] border-l-[3.5px] border-white bg-[#da7756]/40 z-30 cursor-nwse-resize" @mousedown.stop="startManipulateLimitBox('nw', $event)" />
        <div class="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-[3.5px] border-r-[3.5px] border-white bg-[#da7756]/40 z-30 cursor-nesw-resize" @mousedown.stop="startManipulateLimitBox('ne', $event)" />
        <div class="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-[3.5px] border-l-[3.5px] border-white bg-[#da7756]/40 z-30 cursor-nesw-resize" @mousedown.stop="startManipulateLimitBox('sw', $event)" />
        <div class="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-[3.5px] border-r-[3.5px] border-white bg-[#da7756]/40 z-30 cursor-nwse-resize" @mousedown.stop="startManipulateLimitBox('se', $event)" />
        <!-- 4边把手 -->
        <div class="absolute -top-1 inset-x-5 h-2.5 cursor-ns-resize z-25" @mousedown.stop="startManipulateLimitBox('n', $event)" />
        <div class="absolute -bottom-1 inset-x-5 h-2.5 cursor-ns-resize z-25" @mousedown.stop="startManipulateLimitBox('s', $event)" />
        <div class="absolute -left-1 inset-y-5 w-2.5 cursor-ew-resize z-25" @mousedown.stop="startManipulateLimitBox('w', $event)" />
        <div class="absolute -right-1 inset-y-5 w-2.5 cursor-ew-resize z-25" @mousedown.stop="startManipulateLimitBox('e', $event)" />
      </div>

      <!-- 选区控制浮条 -->
      <div
        v-if="isSelectingLimit"
        class="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-2 rounded-full bg-[#211f1c]/95 border border-[#383430] shadow-2xl backdrop-blur-xl text-xs select-none"
        @mousedown.stop
      >
        <button
          type="button"
          @click.stop="handleCancelLimitSelection"
          class="px-3.5 py-1 rounded-full bg-[#2e2a27] hover:bg-[#383430] text-[#a8a29e] hover:text-[#fbfaf8] font-medium transition-colors cursor-pointer active:scale-95"
        >
          取消
        </button>
        <span class="font-mono text-[#fbfaf8] text-xs font-medium tracking-wide">
          {{ displayLimitPixels }}
        </span>
        <button
          type="button"
          @click.stop="handleConfirmLimitSelection"
          class="px-4 py-1 rounded-full bg-[#da7756] hover:bg-[#e28465] text-white font-semibold shadow-lg shadow-[#da7756]/30 transition-all active:scale-95 cursor-pointer"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { MoreVertical, Maximize2, Crosshair, AppWindow, X } from 'lucide-vue-next';
import { scriptStore, isTauriEnv } from '../stores/scriptStore';
import { maskStore } from '../stores/maskStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';

const runAreaRef = ref<HTMLElement | null>(null);
const showMenu = ref(false);
const toggleMenu = (e?: Event) => {
  if (e) e.stopPropagation();
  showMenu.value = !showMenu.value;
};

const currentScriptTitle = computed(() => scriptStore.editingScript.value?.title || '脚本运行区域');
const hasTargetApp = computed(() => Boolean(scriptStore.editingScript.value?.targetApp?.initialBounds));
const targetAppName = computed(() => scriptStore.editingScript.value?.targetApp?.appName || '');
const targetAppBounds = computed(() => {
  const b = scriptStore.editingScript.value?.targetApp?.initialBounds;
  return b ? `${b.width}×${b.height}` : '';
});

// 矩形闪避状态：控制限制区域矩形和命中目标位置矩形的临时显隐（截屏/OCR 取样时瞬间闪避）
const areRectsVisible = ref(true);
if (typeof window !== 'undefined') {
  (window as any).__glimpse_set_rects_visible = (vis: boolean) => {
    areRectsVisible.value = !!vis;
  };
}

// 拾取坐标点
const hoverCoord = ref<{ x: number; y: number } | null>(null);
const onPickingMouseMove = (e: MouseEvent) => {
  if (!runAreaRef.value) return;
  const rect = runAreaRef.value.getBoundingClientRect();
  hoverCoord.value = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
};

const GEOMETRY_KEY = 'glimpse_mask_run_area_geometry';

const syncAndSaveCurrentBounds = async () => {
  if (!isTauriEnv()) return;
  try {
    const win = getCurrentWindow();
    const scaleFactor = await win.scaleFactor().catch(() => 1.0);
    const pos = await win.outerPosition().catch(() => null);
    const size = await win.outerSize().catch(() => null);
    if (!pos || !size) return;

    const logX = Math.round(pos.x / scaleFactor);
    const logY = Math.round(pos.y / scaleFactor);
    const logW = Math.round(size.width / scaleFactor);
    const logH = Math.round(size.height / scaleFactor);

    if (logW > 60 && logH > 50) {
      localStorage.setItem(GEOMETRY_KEY, JSON.stringify({ x: pos.x, y: pos.y, width: size.width, height: size.height }));
      maskStore.bounds.x = logX;
      maskStore.bounds.y = logY;
      maskStore.bounds.width = logW;
      maskStore.bounds.height = logH;
      maskStore.broadcastMaskSync('bounds_updated', { bounds: { ...maskStore.bounds } });
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
      if (width && height) await win.setSize(new PhysicalSize(width, height));
      if (x !== undefined && y !== undefined) await win.setPosition(new PhysicalPosition(x, y));
    }
  } catch (e) {}
};

// 窗口缩放拖动手柄
let isResizingWindow = false;
let lastResizeScreenX = 0;
let lastResizeScreenY = 0;

const onResizeHandleMouseDown = (e: MouseEvent) => {
  if (e.button !== 0 || !isTauriEnv()) return;
  e.preventDefault();
  e.stopPropagation();
  isResizingWindow = true;
  lastResizeScreenX = e.screenX;
  lastResizeScreenY = e.screenY;

  const onWindowResizeMove = (ev: MouseEvent) => {
    if (!isResizingWindow) return;
    const dw = ev.screenX - lastResizeScreenX;
    const dh = ev.screenY - lastResizeScreenY;
    if (dw !== 0 || dh !== 0) {
      lastResizeScreenX = ev.screenX;
      lastResizeScreenY = ev.screenY;
      invoke('resize_mask_window', { delta_w: dw, delta_h: dh, deltaW: dw, deltaH: dh }).then(() => syncAndSaveCurrentBounds()).catch(() => {});
    }
  };

  const onWindowResizeUp = () => {
    isResizingWindow = false;
    window.removeEventListener('mousemove', onWindowResizeMove);
    window.removeEventListener('mouseup', onWindowResizeUp);
    syncAndSaveCurrentBounds();
  };

  window.addEventListener('mousemove', onWindowResizeMove);
  window.addEventListener('mouseup', onWindowResizeUp);
};

// 窗口刘海拖动
let isDraggingNotch = false;
let lastScreenX = 0;
let lastScreenY = 0;

const onNotchMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('button') || e.button !== 0 || !isTauriEnv()) return;
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
      invoke('move_mask_window', { delta_x: dx, delta_y: dy, deltaX: dx, deltaY: dy }).then(() => syncAndSaveCurrentBounds()).catch(() => {});
    }
  };

  const onWindowUp = () => {
    isDraggingNotch = false;
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', onWindowUp);
    syncAndSaveCurrentBounds();
  };

  window.addEventListener('mousemove', onWindowMove);
  window.addEventListener('mouseup', onWindowUp);
};

// 交互状态
const isSelectingLimit = computed(() => maskStore.mode.value === 'selecting_limit');
const isPickingPoint = computed(() => maskStore.mode.value === 'picking_point');
const isViewingMarker = computed(() => maskStore.mode.value === 'viewing_marker');

const onPickPointClick = (e: MouseEvent) => {
  if (!runAreaRef.value) return;
  const rect = runAreaRef.value.getBoundingClientRect();
  scriptStore.reportMaskPointPicked(Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top));
};

const handleCancelPickPoint = () => maskStore.cancelInteraction();

// 联动穿透模式
watch([isSelectingLimit, isPickingPoint, showMenu, isViewingMarker], async ([selecting, picking, menuOpen, viewing]) => {
  if (isTauriEnv()) {
    try {
      const shouldBlock = !viewing && (selecting || picking || menuOpen);
      await invoke('set_mask_selecting_mode', { selecting: shouldBlock });
    } catch (e) {}
  }
}, { immediate: true });

// 基准步骤标记
const baseMarkerData = computed(() => maskStore.context.value?.baseMarker || null);
const baseMarkerRelPos = computed(() => {
  if (!baseMarkerData.value) return null;
  return {
    x: Math.round(baseMarkerData.value.x - maskStore.bounds.x),
    y: Math.round(baseMarkerData.value.y - maskStore.bounds.y)
  };
});
const baseMarkerBox = computed(() => {
  if (!baseMarkerRelPos.value || !baseMarkerData.value) return null;
  const w = Math.round(baseMarkerData.value.width || 60);
  const h = Math.round(baseMarkerData.value.height || 24);
  return {
    left: Math.round(baseMarkerRelPos.value.x - w / 2),
    top: Math.round(baseMarkerRelPos.value.y - h / 2),
    width: w,
    height: h
  };
});

// 基准步骤条件限制区域预览矩形 (紫/青色虚线框，常驻屏幕，选区与定位皆保留)
const baseRoiBox = computed(() => {
  const roi = maskStore.baseROI.value;
  if (!roi || roi.width <= 10 || roi.height <= 10) return null;
  const maskX = Math.round(maskStore.bounds.x);
  const maskY = Math.round(maskStore.bounds.y);
  return {
    left: Math.round(roi.x - maskX),
    top: Math.round(roi.y - maskY),
    width: Math.round(roi.width),
    height: Math.round(roi.height),
    label: roi.label || `基准限制区域: ${Math.round(roi.width)}×${Math.round(roi.height)}px`
  };
});

// 限制区域预览矩形 (蓝色虚线框)
const previewLimitBox = computed(() => {
  const maskX = Math.round(maskStore.bounds.x);
  const maskY = Math.round(maskStore.bounds.y);
  const maskW = Math.round(maskStore.bounds.width);
  const maskH = Math.round(maskStore.bounds.height);

  const roi = maskStore.searchROI.value;
  if (roi && roi.width > 10 && roi.height > 10) {
    const isFull = Math.abs(roi.width - maskW) < 5 && Math.abs(roi.height - maskH) < 5 && Math.abs(roi.x - maskX) < 5 && Math.abs(roi.y - maskY) < 5;
    if (!isFull) {
      return {
        left: Math.round(roi.x - maskX),
        top: Math.round(roi.y - maskY),
        width: Math.round(roi.width),
        height: Math.round(roi.height),
        label: (roi as any).label || `限制区域: ${Math.round(roi.width)}×${Math.round(roi.height)}px`
      };
    }
  }

  // 仅在明确处于查看标记状态时，才按 context 兜底推导
  if (isViewingMarker.value) {
    const ctx = maskStore.context.value;
    const scope = ctx?.previewRegionScope;
    const base = ctx?.baseMarker;
    if (scope && scope.baseType === 'step' && base) {
      const left = scope.left || 0;
      const right = scope.right || 200;
      const top = scope.top || 0;
      const bottom = scope.bottom || 300;
      const relLeft = (base.x - maskX) - left;
      const relTop = (base.y - maskY) - top;
      const w = left + right;
      const h = top + bottom;
      return {
        left: Math.round(relLeft),
        top: Math.round(relTop),
        width: Math.round(Math.max(20, w)),
        height: Math.round(Math.max(20, h)),
        label: `基于步骤 #${base.stepIndex + 1} 限制区域: ${Math.round(w)}×${Math.round(h)}px`
      };
    }
  }

  return null;
});

// 运行/测试命中绿框
const runHitAnchorBox = computed(() => {
  const anchor = maskStore.runHitAnchor.value;
  if (!anchor) return null;
  const relX = Math.round(anchor.x - maskStore.bounds.x);
  const relY = Math.round(anchor.y - maskStore.bounds.y);
  const w = Math.max(20, anchor.width || 60);
  const h = Math.max(16, anchor.height || 24);
  return { left: Math.round(relX - w / 2), top: Math.round(relY - h / 2), width: w, height: h };
});

// 计算初始框选限制区域百分比 (优先使用已有配置，确保零延迟首帧命中，杜绝跳动与抖动)
const calculateInitialPct = () => {
  const init = maskStore.context.value?.initialLimit;
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || maskStore.bounds.width || 760;
  const parentH = rect?.height || maskStore.bounds.height || 520;

  // 1. 若基于前序步骤：优先以基准步骤锚点推导初始橙色框
  const anchor = baseMarkerRelPos.value || (maskStore.runHitAnchor.value ? {
    x: Math.round(maskStore.runHitAnchor.value.x - maskStore.bounds.x),
    y: Math.round(maskStore.runHitAnchor.value.y - maskStore.bounds.y)
  } : null);

  const isStepBase = maskStore.context.value?.offsetStep !== undefined;

  if (isStepBase) {
    const leftVal = Number(init?.left) || 0;
    const rightVal = Number(init?.right) || 0;
    const topVal = Number(init?.top) || 0;
    const bottomVal = Number(init?.bottom) || 0;

    const effectiveAnchor = anchor || {
      x: Math.round(parentW * 0.15),
      y: Math.round(parentH * 0.28)
    };

    // 1.1 若已有保存过非零的有效选区配置（支持负值相对偏移，遵循数据绝对保真）
    if (leftVal !== 0 || rightVal !== 0 || topVal !== 0 || bottomVal !== 0) {
      const l = effectiveAnchor.x - leftVal;
      const t = effectiveAnchor.y - topVal;
      const w = Math.max(20, leftVal + rightVal);
      const h = Math.max(16, topVal + bottomVal);

      const leftPct = Math.max(0, Math.min(95, (l / parentW) * 100));
      const topPct = Math.max(0, Math.min(95, (t / parentH) * 100));
      return {
        left: leftPct,
        top: topPct,
        width: Math.min(100 - leftPct, Math.max(1, (w / parentW) * 100)),
        height: Math.min(100 - topPct, Math.max(1, (h / parentH) * 100))
      };
    }

    // 1.2 默认初始选区：整行选择区域（基于基准定位，选择限制区域即为整行区域）
    const rowH = 54;
    const anchorY = effectiveAnchor.y;
    const topPx = Math.max(10, Math.min(parentH - rowH - 10, anchorY - Math.round(rowH / 2)));
    const topPct = Math.max(0, (topPx / parentH) * 100);
    return {
      left: 2.0,
      top: topPct,
      width: 96.0,
      height: Math.min(100 - topPct, Math.max(1, (rowH / parentH) * 100))
    };
  }

  // 2. 基于蒙版本身限制 (baseType === 'mask')
  if (init && ((init.right && init.right > 0) || (init.bottom && init.bottom > 0) || (init.left && init.left > 0) || (init.top && init.top > 0))) {
    const minX = Math.min(init.left ?? 0, init.right ?? 0);
    const maxX = Math.max(init.left ?? 0, init.right ?? 0);
    const minY = Math.min(init.top ?? 0, init.bottom ?? 0);
    const maxY = Math.max(init.top ?? 0, init.bottom ?? 0);
    if (maxX > minX && maxY > minY) {
      const w = Math.max(20, maxX - minX);
      const h = Math.max(20, maxY - minY);
      const leftPct = Math.max(0, (minX / parentW) * 100);
      const topPct = Math.max(0, (minY / parentH) * 100);
      return {
        left: leftPct,
        top: topPct,
        width: Math.min(100 - leftPct, (w / parentW) * 100),
        height: Math.min(100 - topPct, (h / parentH) * 100)
      };
    }
  }

  // 默认居中选区
  return { left: 15.0, top: 20.0, width: 70.0, height: 40.0 };
};

// 框选限制区域百分比 (声明时即用真实数据计算，而非硬编码 15%)
const limitBoxPct = ref(calculateInitialPct());

const initBoxFromData = () => {
  limitBoxPct.value = calculateInitialPct();
};

// 监听进入选区模式以及 context 变化，立即同步执行，杜绝任何延迟抖动
watch([isSelectingLimit, () => maskStore.context.value], ([sel]) => {
  if (sel) {
    initBoxFromData();
  }
}, { immediate: true });

const displayLimitPixels = computed(() => {
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || 760;
  const parentH = rect?.height || 520;
  const boxL = Math.round((limitBoxPct.value.left / 100) * parentW);
  const boxT = Math.round((limitBoxPct.value.top / 100) * parentH);
  const boxW = Math.round((limitBoxPct.value.width / 100) * parentW);
  const boxH = Math.round((limitBoxPct.value.height / 100) * parentH);
  const boxR = boxL + boxW;
  const boxB = boxT + boxH;

  const anchor = baseMarkerRelPos.value || (maskStore.runHitAnchor.value ? {
    x: Math.round(maskStore.runHitAnchor.value.x - maskStore.bounds.x),
    y: Math.round(maskStore.runHitAnchor.value.y - maskStore.bounds.y)
  } : null);

  if (maskStore.context.value?.offsetStep !== undefined && anchor) {
    const sIdx = (maskStore.context.value.offsetStep ?? 0) + 1;
    const lOff = Math.round(anchor.x - boxL);
    const rOff = Math.round(boxR - anchor.x);
    const tOff = Math.round(anchor.y - boxT);
    const bOff = Math.round(boxB - anchor.y);
    return `相对步骤 #${sIdx}: 左 ${lOff}px · 右 ${rOff}px · 上 ${tOff}px · 下 ${bOff}px (范围 ${boxW}×${boxH}px)`;
  }
  return `限制区域: 左 ${boxL}px · 右 ${boxR}px · 上 ${boxT}px · 下 ${boxB}px (${boxW}×${boxH}px)`;
});

// 选区拖动调整 (支持 4 角 + 4 边 8 向自由拉拽，轻松框选整行或整块区域)
let manipMode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | null = null;
let startMouseX = 0, startMouseY = 0, startLeftPct = 0, startTopPct = 0, startWidthPct = 0, startHeightPct = 0;

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
  const dxPct = ((e.clientX - startMouseX) / (rect.width || 1)) * 100;
  const dyPct = ((e.clientY - startMouseY) / (rect.height || 1)) * 100;

  if (manipMode === 'move') {
    limitBoxPct.value.left = Math.max(0, Math.min(100 - limitBoxPct.value.width, startLeftPct + dxPct));
    limitBoxPct.value.top = Math.max(0, Math.min(100 - limitBoxPct.value.height, startTopPct + dyPct));
  } else if (manipMode === 'se') {
    limitBoxPct.value.width = Math.max(1, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
    limitBoxPct.value.height = Math.max(1, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
  } else if (manipMode === 'nw') {
    const nwW = Math.max(1, startWidthPct - dxPct), nwH = Math.max(1, startHeightPct - dyPct);
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - nwW));
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - nwH));
    limitBoxPct.value.width = nwW; limitBoxPct.value.height = nwH;
  } else if (manipMode === 'ne') {
    const neH = Math.max(1, startHeightPct - dyPct);
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - neH));
    limitBoxPct.value.width = Math.max(1, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
    limitBoxPct.value.height = neH;
  } else if (manipMode === 'sw') {
    const swW = Math.max(1, startWidthPct - dxPct);
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - swW));
    limitBoxPct.value.width = swW;
    limitBoxPct.value.height = Math.max(1, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
  } else if (manipMode === 'n') {
    const nH = Math.max(1, startHeightPct - dyPct);
    limitBoxPct.value.top = Math.max(0, startTopPct + (startHeightPct - nH));
    limitBoxPct.value.height = nH;
  } else if (manipMode === 's') {
    limitBoxPct.value.height = Math.max(1, Math.min(100 - limitBoxPct.value.top, startHeightPct + dyPct));
  } else if (manipMode === 'w') {
    const wW = Math.max(1, startWidthPct - dxPct);
    limitBoxPct.value.left = Math.max(0, startLeftPct + (startWidthPct - wW));
    limitBoxPct.value.width = wW;
  } else if (manipMode === 'e') {
    limitBoxPct.value.width = Math.max(1, Math.min(100 - limitBoxPct.value.left, startWidthPct + dxPct));
  }
};

const onManipulateMouseUp = () => {
  manipMode = null;
  window.removeEventListener('mousemove', onManipulateMouseMove);
  window.removeEventListener('mouseup', onManipulateMouseUp);
};

const handleCancelLimitSelection = async () => {
  maskStore.cancelInteraction();
  await maskStore.setSelectingMode(false);
  await maskStore.setVisible(false);
};

const handleConfirmLimitSelection = async () => {
  const rect = runAreaRef.value?.getBoundingClientRect();
  const parentW = rect?.width || 760;
  const parentH = rect?.height || 520;
  const l = Math.round((limitBoxPct.value.left / 100) * parentW);
  const r = Math.round(((limitBoxPct.value.left + limitBoxPct.value.width) / 100) * parentW);
  const t = Math.round((limitBoxPct.value.top / 100) * parentH);
  const b = Math.round(((limitBoxPct.value.top + limitBoxPct.value.height) / 100) * parentH);

  const anchor = baseMarkerRelPos.value || (maskStore.runHitAnchor.value ? {
    x: Math.round(maskStore.runHitAnchor.value.x - maskStore.bounds.x),
    y: Math.round(maskStore.runHitAnchor.value.y - maskStore.bounds.y)
  } : null);

  const effectiveAnchor = anchor || (maskStore.context.value?.offsetStep !== undefined ? {
    x: Math.round(parentW * 0.15),
    y: Math.round(parentH * 0.28)
  } : null);

  if (maskStore.context.value?.offsetStep !== undefined && effectiveAnchor) {
    const leftOffset = Math.round(effectiveAnchor.x - l);
    const rightOffset = Math.round(r - effectiveAnchor.x);
    const topOffset = Math.round(effectiveAnchor.y - t);
    const bottomOffset = Math.round(b - effectiveAnchor.y);
    scriptStore.reportMaskLimitSelected(leftOffset, rightOffset, topOffset, bottomOffset);
  } else {
    scriptStore.reportMaskLimitSelected(l, r, t, b);
  }
  await maskStore.setSelectingMode(false);
};

const handleMenuAction = async (action: string) => {
  showMenu.value = false;
  if (action === 'close') await maskStore.setVisible(false);
  else if (action === 'snap_app') {
    const targetApp = scriptStore.editingScript.value?.targetApp;
    if (targetApp) await scriptStore.snapMaskToApp(targetApp);
  } else if (action === 'detect_app') {
    const front = await scriptStore.detectFrontmostApp();
    if (front?.appName) scriptStore.bindTargetAppToCurrentScript(front);
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (scriptStore.executionStatus.value === 'running' || scriptStore.executionStatus.value === 'paused') {
      scriptStore.stopScript();
    }
    maskStore.cancelInteraction();
    maskStore.setSelectingMode(false);
    if (scriptStore.isRecording.value) {
      scriptStore.stopRecording();
    } else if (showMenu.value) {
      showMenu.value = false;
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).__glimpse_emergency_stop = () => {
    maskStore.cancelInteraction();
    maskStore.setSelectingMode(false);
  };
}

const syncMaskStateFromStorage = () => {
  try {
    const raw = localStorage.getItem('glimpse_mask_sync_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.msg) {
        maskStore.handleMaskSyncMessage(parsed.msg);
      }
    }
  } catch (e) {}
  maskStore.pullLatestSyncFromNative();
};

const handleVisibilityChange = () => {
  if (!document.hidden) {
    syncMaskStateFromStorage();
  }
};

onMounted(async () => {
  await restoreGeometry();
  syncMaskStateFromStorage();
  window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('focus', syncMaskStateFromStorage);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (isTauriEnv()) {
    try {
      const win = getCurrentWindow();
      await win.onResized(() => syncAndSaveCurrentBounds());
      await win.onMoved(() => syncAndSaveCurrentBounds());
      await syncAndSaveCurrentBounds();
    } catch (e) {}
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('focus', syncMaskStateFromStorage);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('mousemove', onManipulateMouseMove);
  window.removeEventListener('mouseup', onManipulateMouseUp);
});
</script>
