<template>
<!-- 板块 1: 脚本基本信息 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-semibold text-[#fbfaf8]">
              <FileText class="w-3.5 h-3.5 text-[#da7756]" />
              <span>脚本基本信息</span>
            </div>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">脚本标题</label>
                <input
                  v-model="script.title"
                  type="text"
                  placeholder="请输入清晰的脚本标题..."
                  class="w-full px-3.5 py-2 text-xs rounded-xl bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-[#da7756] transition-colors"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">备注说明</label>
                <div v-if="!isNotesExpanded && !script.notes" @click="isNotesExpanded = true" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] text-xs transition-colors">
                  <Plus class="w-3.5 h-3.5" /> 添加备注说明
                </div>
                <div v-else-if="!isNotesExpanded && script.notes" @click="isNotesExpanded = true" class="cursor-pointer px-3.5 py-2 text-xs rounded-xl bg-[#191716] border border-[#383430] text-[#a8a29e] truncate hover:border-[#da7756] transition-colors" title="点击展开编辑">
                  {{ script.notes }}
                </div>
                <textarea
                  v-else
                  v-model="script.notes"
                  rows="3"
                  ref="notesTextarea"
                  @blur="isNotesExpanded = false"
                  placeholder="例如：本脚本用于桌面日常登录或特定坐标快速连点..."
                  class="w-full px-3.5 py-2 text-xs rounded-xl bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-[#da7756] transition-colors resize-y"
                ></textarea>
              </div>
            </div>
          </div>
          <div class="border-t border-[#383430]/70" />

          <!-- 板块 2: 🎯 目标应用与窗口基准绑定 (核心依赖·必须优先绑定) -->
          <div class="space-y-3.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <AppWindow class="w-4 h-4 text-emerald-400" />
                <span class="text-xs font-bold text-[#fbfaf8]">目标应用与窗口尺寸管理</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30 font-semibold">
                  核心依赖 · 必须优先绑定
                </span>
              </div>
              <span v-if="isWindowBound" class="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>已建立窗口物理坐标系</span>
              </span>
              <span v-else class="text-[11px] text-amber-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>未绑定 (添加动作与录制前必须先绑定)</span>
              </span>
            </div>

            <!-- 快捷操作栏 (已有记录模式 vs 尚未绑定模式) -->
            <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#211f1c] border border-[#383430]">
              <!-- 场景 1: 已有记录的情况下 (极其收敛：【定位并调整】 + 【重新定位 ▾】) -->
              <template v-if="script.targetApp && script.targetApp.initialBounds">
                <div class="flex flex-wrap items-center gap-2.5">
                  <!-- 核心主操作：定位目标 App -->
                  <button
                    type="button"
                    @click="handleLocateAndAdjustApp"
                    :disabled="isAdjustingApp"
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-md shadow-[#da7756]/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    title="激活目标应用，将桌面悬浮蒙版移动并调整为该应用窗口大小"
                  >
                    <Crosshair class="w-3.5 h-3.5" :class="isAdjustingApp ? 'animate-spin' : ''" />
                    <span>{{ isAdjustingApp ? '正在定位...' : '🎯 定位' }}</span>
                  </button>

                  <!-- 重新定位下拉菜单组：【定位 App（打开 app 选择），全屏定位，部分区域定位】 -->
                  <div class="relative">
                    <button
                      type="button"
                      @click.stop="showRelocateMenu = !showRelocateMenu"
                      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#2c2825] hover:bg-[#34302c] text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-all cursor-pointer active:scale-95"
                      :class="showRelocateMenu ? 'border-[#da7756]/60 bg-[#34302c]' : ''"
                      title="展开重新定位选项：定位 App、全屏定位或部分区域定位"
                    >
                      <RotateCcw class="w-3.5 h-3.5 text-[#da7756]" />
                      <span>🔄 重新定位</span>
                      <ChevronDown class="w-3.5 h-3.5 text-[#a8a29e] transition-transform duration-200" :class="showRelocateMenu ? 'rotate-180' : ''" />
                    </button>

                    <!-- 全屏透明遮罩：点击外部必定安全关闭菜单 -->
                    <div
                      v-if="showRelocateMenu"
                      class="fixed inset-0 z-40 bg-transparent"
                      @click.stop="showRelocateMenu = false"
                    />

                    <!-- 下拉浮动菜单 (z-50，置于透明遮罩之上) -->
                    <div
                      v-if="showRelocateMenu"
                      class="absolute top-full left-0 mt-1.5 w-60 rounded-2xl bg-[#262320] border border-[#383430] shadow-2xl backdrop-blur-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1 select-none"
                      @click.stop
                    >
                      <!-- 选项 1: 定位 App（打开 app 选择） -->
                      <button
                        type="button"
                        @click.stop="handleRelocateSelectApp"
                        class="w-full px-3 py-2 rounded-xl text-left hover:bg-[#34302c] text-[#fbfaf8] flex items-center gap-2.5 transition-colors cursor-pointer group"
                      >
                        <div class="p-1.5 rounded-lg bg-[#da7756]/15 text-[#da7756] shrink-0">
                          <AppWindow class="w-4 h-4" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <span class="text-xs font-semibold block text-[#fbfaf8] group-hover:text-[#da7756] transition-colors">定位 App</span>
                          <span class="text-[10px] text-[#78716c] block truncate">打开应用列表选择运行窗口</span>
                        </div>
                      </button>

                      <!-- 选项 2: 全屏定位 -->
                      <button
                        type="button"
                        @click.stop="handleRelocateFullscreen"
                        class="w-full px-3 py-2 rounded-xl text-left hover:bg-[#34302c] text-[#fbfaf8] flex items-center gap-2.5 transition-colors cursor-pointer group"
                      >
                        <div class="p-1.5 rounded-lg bg-sky-500/15 text-sky-400 shrink-0">
                          <Monitor class="w-4 h-4" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <span class="text-xs font-semibold block text-[#fbfaf8] group-hover:text-sky-400 transition-colors">全屏定位</span>
                          <span class="text-[10px] text-[#78716c] block truncate">将运行基准切换为整个屏幕</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 右侧：清除解绑小按钮 -->
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    @click="handleClearTargetApp"
                    class="p-1.5 rounded-lg text-[#a8a29e] hover:text-red-400 hover:bg-[#2c2825] transition-colors cursor-pointer"
                    title="清除当前已绑定的应用"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </template>

              <!-- 场景 2: 尚未绑定目标应用或无记录时 -->
              <template v-else>
                <div class="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    @click="handleOpenAppPicker"
                    class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-md shadow-[#da7756]/20 transition-all active:scale-95 cursor-pointer"
                    title="浏览并选择系统中当前打开的应用窗口"
                  >
                    <AppWindow class="w-3.5 h-3.5" />
                    <span>🎯 定位 App（打开选择）</span>
                  </button>

                  <button
                    type="button"
                    @click="handleFullscreenLocate"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2c2825] hover:bg-[#34302c] text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-colors cursor-pointer"
                    title="将运行基准切换为整个屏幕，蒙版铺满全屏"
                  >
                    <Monitor class="w-3.5 h-3.5 text-sky-400" />
                    <span>🖥️ 全屏定位</span>
                  </button>
                </div>
              </template>
            </div>

            <!-- 已绑定状态详情 -->
            <div v-if="script.targetApp && script.targetApp.initialBounds" class="space-y-3.5">
              <!-- 基本信息展示 -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-[#211f1c] border border-[#383430] text-xs">
                <div>
                  <span class="text-[#78716c] block mb-0.5">应用名称</span>
                  <span class="text-[#fbfaf8] font-semibold">{{ script.targetApp.appName || '未命名' }}</span>
                  <span v-if="script.targetApp.pid" class="text-[#78716c] ml-1.5 font-mono text-[11px]">(PID: {{ script.targetApp.pid }})</span>
                </div>
                <div>
                  <span class="text-[#78716c] block mb-0.5">窗口标题</span>
                  <span class="text-[#a8a29e] truncate block font-mono" :title="script.targetApp.windowTitle || ''">
                    {{ script.targetApp.windowTitle || '(主窗口)' }}
                  </span>
                </div>
                <div>
                  <span class="text-[#78716c] block mb-0.5">Bundle ID</span>
                  <span class="text-[#a8a29e] font-mono text-[11px] truncate block" :title="script.targetApp.bundleId || ''">
                    {{ script.targetApp.bundleId || '未知' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 未绑定时的提示 -->
            <div v-else class="py-5 px-4 rounded-xl border border-dashed border-[#da7756]/40 bg-[#da7756]/5 text-center">
              <AppWindow class="w-7 h-7 text-[#da7756] mx-auto mb-2" />
              <p class="text-xs font-semibold text-[#fbfaf8] mb-1">尚未绑定目标应用窗口</p>
              <p class="text-[11px] text-[#a8a29e] max-w-sm mx-auto leading-relaxed">
                点击上方「🎯 自动定位前台 App」或「📋 从运行应用列表选择」，系统将自动捕获应用初始宽高并确立物理坐标基准。
              </p>
            </div>
          </div>

          <div class="border-t border-[#383430]/70" />

          <!-- 板块 3: 全局运行策略 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-semibold text-[#fbfaf8]">
              <Sliders class="w-3.5 h-3.5 text-[#da7756]" />
              <span>全局运行策略</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <!-- 默认等待 -->
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">全局默认等待 (秒)</label>
                <div class="flex items-center">
                  <button
                    type="button"
                    @click="handleWaitChange(-0.5)"
                    class="px-2.5 py-2 rounded-l-xl bg-[#211f1c] hover:bg-[#2c2825] border border-r-0 border-[#383430] text-[#a8a29e] hover:text-[#fbfaf8] transition-colors"
                  >
                    <Minus class="w-3.5 h-3.5" />
                  </button>
                  <input
                    v-model.number="script.config.defaultWaitSeconds"
                    type="number"
                    step="0.1"
                    min="0.1"
                    class="w-full py-2 text-center text-xs bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:outline-none focus:border-[#da7756]"
                  />
                  <button
                    type="button"
                    @click="handleWaitChange(0.5)"
                    class="px-2.5 py-2 rounded-r-xl bg-[#211f1c] hover:bg-[#2c2825] border border-l-0 border-[#383430] text-[#a8a29e] hover:text-[#fbfaf8] transition-colors"
                  >
                    <Plus class="w-3.5 h-3.5" />
                  </button>
                </div>
                <p class="text-[10px] text-[#78716c] mt-1">未单独设置等待的动作沿用此值</p>
              </div>

              <!-- 重复次数 -->
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">重复次数</label>
                <div class="flex items-center">
                  <button
                    type="button"
                    :disabled="isInfiniteLoop"
                    @click="handleRepeatChange(-1)"
                    class="px-2.5 py-2 rounded-l-xl bg-[#211f1c] hover:bg-[#2c2825] border border-r-0 border-[#383430] text-[#a8a29e] disabled:opacity-40 transition-colors"
                  >
                    <Minus class="w-3.5 h-3.5" />
                  </button>
                  <input
                    v-if="!isInfiniteLoop"
                    v-model.number="script.config.repeatCount"
                    type="number"
                    min="1"
                    class="w-full py-2 text-center text-xs bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:outline-none focus:border-[#da7756]"
                  />
                  <div
                    v-else
                    class="w-full py-2 text-center text-xs bg-[#191716] border border-[#383430] text-[#da7756] font-semibold"
                  >
                    ∞ 无限循环
                  </div>
                  <button
                    type="button"
                    :disabled="isInfiniteLoop"
                    @click="handleRepeatChange(1)"
                    class="px-2.5 py-2 rounded-r-xl bg-[#211f1c] hover:bg-[#2c2825] border border-l-0 border-[#383430] text-[#a8a29e] disabled:opacity-40 transition-colors"
                  >
                    <Plus class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div class="mt-1 flex items-center">
                  <label class="flex items-center gap-1.5 text-xs text-[#a8a29e] cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="isInfiniteLoop"
                      @change="handleToggleInfinite"
                      class="rounded bg-[#211f1c] border-[#383430] text-[#da7756] focus:ring-[#da7756]"
                    />
                    <span>无限循环 (按停止键结束)</span>
                  </label>
                </div>
              </div>

              <!-- 运行倍速 -->
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">执行运行倍速</label>
                <div class="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#191716] border border-[#383430]">
                  <button
                    v-for="s in [0.5, 1.0, 1.5, 2.0]"
                    :key="s"
                    type="button"
                    @click="script.config.executionSpeed = s"
                    class="py-1.5 text-center text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    :class="(script.config.executionSpeed ?? 1.0) === s ? 'bg-[#da7756] text-white shadow-sm' : 'text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825]'"
                  >
                    {{ s }}x
                  </button>
                </div>
                <p class="text-[10px] text-[#78716c] mt-1">自动按倍率缩放每一步延时</p>
              </div>

              <!-- 失败保护 -->
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">失败保护机制</label>
                <div class="flex items-center justify-between p-2 rounded-xl bg-[#191716] border border-[#383430]">
                  <span class="text-xs text-[#fbfaf8]">动作失败立即暂停</span>
                  <button
                    type="button"
                    @click="script.config.pauseOnFailure = !script.config.pauseOnFailure"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    :class="script.config.pauseOnFailure ? 'bg-[#da7756]' : 'bg-[#2c2825]'"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                      :class="script.config.pauseOnFailure ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                </div>
                <p class="text-[10px] text-[#78716c] mt-1">未识别到文字或动作超时暂停</p>
              </div>

              <!-- 诊断报告 -->
              <div>
                <label class="block text-xs font-medium text-[#a8a29e] mb-1.5">OCR 诊断报告</label>
                <div class="flex items-center justify-between p-2 rounded-xl bg-[#191716] border border-[#383430]">
                  <span class="text-xs text-[#fbfaf8]">运行后生成 Markdown 报告</span>
                  <button
                    type="button"
                    @click="script.config.exportMarkdownReport = !script.config.exportMarkdownReport"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    :class="script.config.exportMarkdownReport ? 'bg-[#da7756]' : 'bg-[#2c2825]'"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                      :class="script.config.exportMarkdownReport ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                </div>
                <p class="text-[10px] text-[#78716c] mt-1">含截图对比与 Vision 识别详情，输出到 /tmp</p>
              </div>
            </div>
</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { FileText, Sliders, Minus, Plus, AppWindow, RotateCcw, ChevronDown, Monitor, Trash2 } from 'lucide-vue-next';
import type { AutomationScript } from '../../types/script';

const props = defineProps<{
  script: AutomationScript;
}>();

const isInfiniteLoop = computed(() => props.script.config.repeatCount === 0);

const handleWaitChange = (delta: number) => {
  const current = props.script.config.defaultWaitSeconds ?? 1.0;
  const next = Math.max(0.1, Math.round((current + delta) * 10) / 10);
  props.script.config.defaultWaitSeconds = next;
};

const handleRepeatChange = (delta: number) => {
  if (isInfiniteLoop.value) return;
  const current = props.script.config.repeatCount ?? 1;
  props.script.config.repeatCount = Math.max(1, current + delta);
};

const handleToggleInfinite = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.checked) {
    props.script.config.repeatCount = 0;
  } else {
    props.script.config.repeatCount = 1;
  }
};

const isNotesExpanded = ref(false);
const notesTextarea = ref<HTMLTextAreaElement | null>(null);
watch(isNotesExpanded, (val) => {
  if (val) nextTick(() => notesTextarea.value?.focus());
});

const isWindowBound = computed(() => {
  return Boolean(props.script?.targetApp?.appName && props.script?.targetApp?.initialBounds);
});

const emit = defineEmits<{
  (e: 'locate-adjust'): void;
  (e: 'relocate-select'): void;
  (e: 'relocate-fullscreen'): void;
  (e: 'clear-target'): void;
  (e: 'open-picker'): void;
  (e: 'fullscreen-locate'): void;
}>();

const isAdjustingApp = ref(false);
const showRelocateMenu = ref(false);

const handleLocateAndAdjustApp = () => emit('locate-adjust');
const handleRelocateSelectApp = () => { showRelocateMenu.value = false; emit('relocate-select'); };
const handleRelocateFullscreen = () => { showRelocateMenu.value = false; emit('relocate-fullscreen'); };
const handleClearTargetApp = () => emit('clear-target');
const handleOpenAppPicker = () => emit('open-picker');
const handleFullscreenLocate = () => emit('fullscreen-locate');

</script>
