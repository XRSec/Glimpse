<template>
  <div v-if="script" class="min-h-full w-full flex flex-col bg-[#191716] text-[#fbfaf8] font-sans relative">
    <ScriptHeader 
      :script="script" 
      :isNewScript="isNewScript" 
      :isMaskOpen="isMaskOpen" 
      :isDirty="isDirty" 
      :justSaved="justSaved"
      @back="handleBack"
      @toggle-mask="toggleMask"
      @save="handleSave"
    />
    <div
      v-if="scriptStore.isRecording.value"
      class="bg-red-500/15 border-b border-red-500/30 px-6 py-2 flex items-center justify-between shrink-0"
    >
      <div class="flex items-center gap-2 text-red-400 text-xs font-medium">
        <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
        <span>🔴 正在进行智能录制：在目标应用窗口内点击任意位置，将自动采集屏幕坐标并追加动作</span>
      </div>
      <button
        @click="scriptStore.stopRecording"
        class="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
      >
        完成录制
      </button>
    </div>
    <div class="px-6 py-6 pb-36 space-y-6 flex-1 w-full">
      <section class="rounded-2xl bg-[#24211e]/90 border border-[#383430] shadow-sm transition-all duration-200">
        <div
          @click="isBaseSettingsExpanded = !isBaseSettingsExpanded"
          class="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-[#2c2825]/60 transition-colors select-none"
        >
          <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            <div class="p-1.5 rounded-lg bg-[#da7756]/15 text-[#da7756] shrink-0">
              <Sliders class="w-4 h-4" />
            </div>
            <span class="text-xs font-bold text-[#fbfaf8] shrink-0">脚本基础、目标窗口与全局设置</span>
            <div v-if="!isBaseSettingsExpanded" class="flex items-center gap-2 text-[11px] text-[#a8a29e] font-mono truncate">
              <span class="text-[#fbfaf8] font-semibold truncate max-w-[160px]">【{{ script.title || '未命名脚本' }}】</span>
              <span
                v-if="isWindowBound"
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>{{ script.targetApp?.appName }}</span>
                <span v-if="script.targetApp?.initialBounds" class="font-mono">({{ script.targetApp.initialBounds.width }}×{{ script.targetApp.initialBounds.height }})</span>
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>⚠️ 待绑定目标窗口</span>
              </span>
              <span class="px-1.5 py-0.5 rounded bg-[#1c1a17] text-[#a8a29e] border border-[#383430] shrink-0">
                等待: {{ script.config.defaultWaitSeconds }}s
              </span>
              <span class="px-1.5 py-0.5 rounded bg-[#1c1a17] text-[#a8a29e] border border-[#383430] shrink-0">
                {{ script.config.repeatCount === 0 ? '循环: 无限' : `重复: ${script.config.repeatCount}次` }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 text-[#a8a29e] text-xs shrink-0">
            <span class="text-[11px] text-[#78716c]">{{ isBaseSettingsExpanded ? '收起设置' : '展开微调' }}</span>
            <component :is="isBaseSettingsExpanded ? ChevronUp : ChevronDown" class="w-4 h-4 text-[#a8a29e]" />
          </div>
        </div>
        <div v-if="isBaseSettingsExpanded" class="p-5 pt-4 border-t border-[#383430] space-y-6 bg-[#1c1a17]/50 animate-in fade-in duration-150">
          <ScriptBasicSettings 
      :script="script" 
      @locate-adjust="handleLocateAndAdjustApp"
      @relocate-select="handleRelocateSelectApp"
      @relocate-fullscreen="handleRelocateFullscreen"
      @clear-target="handleClearTargetApp"
      @open-picker="handleOpenAppPicker"
      @fullscreen-locate="handleFullscreenLocate"
    />
          </div>
      </section>
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-xs font-semibold text-[#fbfaf8]">
            <ListTree class="w-4 h-4 text-[#da7756]" />
            <span>编排执行动作流</span>
            <span class="text-[#a8a29e] font-normal">({{ script.actions.length }} 个步骤)</span>
          </div>
          <div class="flex items-center gap-2" v-if="script.actions.length > 0">
            <button
              @click="toggleAllActions(true)"
              class="px-2 py-1 rounded text-[11px] text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors"
            >
              全部展开
            </button>
            <button
              @click="toggleAllActions(false)"
              class="px-2 py-1 rounded text-[11px] text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors"
            >
              全部收起
            </button>
          </div>
        </div>
        <div
          v-if="!isWindowBound && script.actions.length > 0"
          class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200 gap-3"
        >
          <div class="flex items-center gap-2.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>目标窗口未绑定：添加步骤、录制与限制区域选择均已被安全锁定。请先在上方绑定目标应用窗口。</span>
          </div>
          <button
            type="button"
            @click="isBaseSettingsExpanded = true"
            class="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/40 shrink-0 transition-colors cursor-pointer"
          >
            展开绑定窗口
          </button>
        </div>
        <div
          v-if="!isWindowBound && script.actions.length === 0"
          class="py-12 px-6 rounded-2xl border-2 border-dashed border-[#da7756]/40 bg-[#24211e]/40 flex flex-col items-center justify-center text-center space-y-4"
        >
          <div class="w-14 h-14 rounded-2xl bg-[#211f1c] border border-[#da7756]/40 flex items-center justify-center text-[#da7756] shadow-inner">
            <AppWindow class="w-7 h-7" />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-bold text-[#fbfaf8]">
              创建自动化脚本必须先确立定位基准
            </h3>
            <p class="text-xs text-[#a8a29e] max-w-md mx-auto leading-relaxed">
              macOS 桌面自动化的点击坐标、Apple 原生 Vision OCR 与限制识别区域，均以目标物理尺寸为绝对基准。请先选择定位基准：
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              @click="handleOpenAppPicker"
              class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-lg shadow-[#da7756]/20 transition-all active:scale-95 cursor-pointer"
            >
              <AppWindow class="w-4 h-4" />
              <span>🎯 定位 App（打开选择）</span>
            </button>
            <button
              type="button"
              @click="handleFullscreenLocate"
              class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#262320] hover:bg-[#34302c] text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-colors cursor-pointer"
            >
              <Monitor class="w-4 h-4 text-sky-400" />
              <span>🖥️ 全屏定位</span>
            </button>
          </div>
        </div>
        <div
          v-else-if="isWindowBound && script.actions.length === 0"
          class="py-12 px-6 rounded-2xl border-2 border-dashed border-[#383430] bg-[#24211e]/40 flex flex-col items-center justify-center text-center space-y-3"
        >
          <div class="w-12 h-12 rounded-2xl bg-[#211f1c] border border-[#383430] flex items-center justify-center text-[#da7756] shadow-inner">
            <ListTree class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-[#fbfaf8] mb-1">
              目标窗口已绑定 · 动作流待编排
            </h3>
            <p class="text-xs text-[#a8a29e] max-w-md mx-auto leading-relaxed">
              已成功锁定「{{ script.targetApp?.appName }}」，您可以点击下方按钮添加「点击文字 (OCR)」或「点击位置 (坐标)」，也可以直接开启屏幕录制！
            </p>
          </div>
          <div class="flex items-center gap-3 pt-2">
            <ActionCascadeMenu placement="bottom-left" @select="addNewAction">
              <template #trigger>
                <button
                  type="button"
                  class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-lg shadow-[#da7756]/20 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus class="w-4 h-4" />
                  <span>+ 添加一个动作 ▾</span>
                </button>
              </template>
            </ActionCascadeMenu>
            <button
              @click="handleTriggerRecord"
              class="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/20 transition-all active:scale-95 cursor-pointer"
            >
              <CircleDot class="w-4 h-4" />
              <span>🔴 录制</span>
            </button>
          </div>
        </div>
        <div v-else>
          <draggable
            :list="script.actions"
            item-key="id"
            handle=".drag-handle"
            ghost-class="opacity-30"
            animation="200"
            class="space-y-3"
          >
            <template #item="{ element: act, index: idx }">
              <ActionRow
                :action="act"
                :index="idx"
                :is-first="idx === 0"
                :is-last="idx === script.actions.length - 1"
                @move-up="moveAction(idx, -1)"
                @move-down="moveAction(idx, 1)"
                @delete="removeAction(idx)"
              />
            </template>
          </draggable>
          <div class="pt-3 flex items-center gap-3">
            <ActionCascadeMenu v-if="isWindowBound" placement="top-left" class="flex-1" @select="addNewAction">
              <template #trigger>
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#24211e] hover:bg-[#2c2825] border border-[#383430] hover:border-[#da7756]/60 text-[#fbfaf8] text-xs font-semibold transition-all active:scale-[0.99] shadow-sm cursor-pointer"
                >
                  <Plus class="w-4 h-4 text-[#da7756]" />
                  <span>+ 添加一个动作 (展开动作菜单 ▾)</span>
                </button>
              </template>
            </ActionCascadeMenu>
            <button
              v-else
              type="button"
              @click="promptBindWindow"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#24211e] border border-[#383430] text-[#78716c] text-xs font-semibold opacity-60 cursor-not-allowed"
              title="请先在上方绑定目标窗口"
            >
              <Plus class="w-4 h-4 text-[#78716c]" />
              <span>+ 添加一个动作 (需先绑定窗口)</span>
            </button>
            <button
              v-if="isWindowBound"
              @click="handleTriggerRecord"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#24211e] hover:bg-[#2c2825] border border-[#383430] hover:border-red-500/60 text-[#fbfaf8] text-xs font-semibold transition-all active:scale-[0.99] shadow-sm cursor-pointer"
            >
              <CircleDot class="w-4 h-4 text-red-500" />
              <span>🔴 录制</span>
            </button>
            <button
              v-else
              type="button"
              @click="promptBindWindow"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#24211e] border border-[#383430] text-[#78716c] text-xs font-semibold opacity-60 cursor-not-allowed"
              title="请先在上方绑定目标窗口"
            >
              <CircleDot class="w-4 h-4 text-[#78716c]" />
              <span>🔴 录制 (需先绑定窗口)</span>
            </button>
          </div>
        </div>
      </section>
    </div>
    <FloatingRunBar :script="script" :isWindowBound="isWindowBound" @run="handleRunCurrentScript" @stop="handleStopCurrentScript" @open-log="scrollToRunLog" />
    <div
      v-if="showOpenRegionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4"
    >
      <div class="w-full max-w-md rounded-2xl bg-[#262320] border border-[#383430] p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        <h3 class="text-base font-bold text-[#fbfaf8] text-center">
          请先打开脚本运行屏幕区域
        </h3>
        <p class="text-xs text-[#a8a29e] text-center leading-relaxed px-2">
          所有 屏幕点击/屏幕识别 相关的脚本动作都将在设置的屏幕区域内运行，请确保运行区域完整覆盖目标屏幕内容
        </p>
        <div class="grid grid-cols-2 gap-3 pt-3">
          <button
            type="button"
            @click="showOpenRegionModal = false"
            class="w-full py-2.5 rounded-xl bg-[#211f1c] hover:bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            @click="handleConfirmOpenRegionAndRun"
            class="w-full py-2.5 rounded-xl bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-lg shadow-[#da7756]/30 transition-colors cursor-pointer"
          >
            打开
          </button>
        </div>
      </div>
    </div>
    <AppPickerModal :show="showAppPickerModal" :runningAppsList="runningAppsList" @close="showAppPickerModal = false" @detect-frontmost="handleDetectAndBindFrontmostFromModal" @refresh="handleOpenAppPicker" @select-app="handleSelectAppFromList" />
    <RunLogPanel />
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {   ArrowLeft,   Save,   Crosshair,   FileText,   Sliders,   Minus,   Plus,   ListTree,   CircleDot,   Play,   Pause,   Square,   Layers,   ChevronDown,   ChevronUp,   AppWindow,   Zap,   Trash2,   X,   RotateCcw,   Monitor,   Check
} from 'lucide-vue-next';
import { scriptStore, createDefaultAction, isTauriEnv } from '../stores/scriptStore';
import { maskStore } from '../stores/maskStore';
import { automationController } from '../services/automationController';
import ScriptHeader from './script/ScriptHeader.vue';
import ScriptBasicSettings from './script/ScriptBasicSettings.vue';
import ActionRow from './ActionRow.vue';
import ActionCascadeMenu from './ActionCascadeMenu.vue';
import draggable from 'vuedraggable';
import AppPickerModal from './script/AppPickerModal.vue';
import FloatingRunBar from './script/FloatingRunBar.vue';
import RunLogPanel from './RunLogPanel.vue';
import type { AutomationScript, ActionType } from '../types/script';
const showAppPickerModal = ref(false);
const runningAppsList = ref<any[]>([]);
const handleOpenAppPicker = async () => {
  showAppPickerModal.value = true;
  runningAppsList.value = await scriptStore.fetchRunningApps();
};
const handleSelectAppFromList = async (appItem: any) => {
  scriptStore.bindTargetAppToCurrentScript(appItem);
  showAppPickerModal.value = false;
  await maskStore.setVisible(true);
  await scriptStore.snapMaskToApp(appItem);
};
const handleDetectAndBindFrontmostFromModal = async () => {
  const front = await scriptStore.detectFrontmostApp();
  if (front && front.appName) {
    await handleSelectAppFromList(front);
  }
};
const script = scriptStore.editingScript;
const savedVersion = ref(0);
const currentVersion = ref(0);
const isDirty = computed(() => currentVersion.value !== savedVersion.value);
const markDirty = () => { currentVersion.value++; };
const markClean = () => { savedVersion.value = currentVersion.value; };
watch(
  () => script.value,   () => { markDirty(); },   { deep: true }
);
const justSaved = ref(false);
let saveTimer: any = null;
const isWindowBound = computed(() => {
  return Boolean(script.value?.targetApp?.appName && script.value?.targetApp?.initialBounds);
});
const isMaskOpen = computed(() => {
  return maskStore.visible.value;
});
const isBaseSettingsExpanded = ref(false);
const showRelocateMenu = ref(false);
onMounted(async () => {
  isBaseSettingsExpanded.value = false;
  if (script.value?.actions) {
    script.value.actions.forEach(a => {
      a.isExpanded = false;
    });
  }
  if (isTauriEnv()) {
    try {
      await maskStore.syncFromNative();
    } catch (e) {}
  }
  await nextTick();
  markClean();
});
const isAdjustingApp = ref(false);
const promptBindWindow = () => {
  isBaseSettingsExpanded.value = true;
  alert('⚠️ 请先确立定位基准！\n\n自动化脚本基于目标窗口建立基准物理坐标系与尺寸约束。请在上方点击「🎯 定位 App」或「🖥️ 全屏定位」。');
};
const handleRelocateSelectApp = async () => {
  showRelocateMenu.value = false;
  await handleOpenAppPicker();
};
const handleRelocateFullscreen = async () => {
  showRelocateMenu.value = false;
  await handleFullscreenLocate();
};
const handleLocateAndAdjustApp = async () => {
  if (!script.value?.targetApp) return;
  isAdjustingApp.value = true;
  try {
    const targetApp = script.value.targetApp;
    if (targetApp.bundleId === 'com.apple.fullscreen') {
      await handleFullscreenLocate();
      return;
    }
    await automationController.ensureMaskAlignedToTargetApp(targetApp);
  } catch (err) {
    console.error('handleLocateAndAdjustApp error:', err);
    scriptStore.addLog('warn', '定位目标应用时遇到异常');
  } finally {
    isAdjustingApp.value = false;
  }
};
const handleRedetectApp = async () => {
  const front = await scriptStore.detectFrontmostApp();
  if (front && front.appName && front.appName !== 'Glimpse') {
    scriptStore.bindTargetAppToCurrentScript(front);
    await setOverlayVisible(true);
    await scriptStore.snapMaskToApp(front);
    scriptStore.addLog('success', `🔄 已重新定位并贴合前台应用「${front.appName}」`);
  } else {
    await handleOpenAppPicker();
  }
};
const handleFullscreenLocate = async () => {
  await scriptStore.setFullscreenTargetRegion();
};
const handleDetectFrontmostApp = async () => {
  const front = await scriptStore.detectFrontmostApp();
  if (front && front.appName) {
    scriptStore.bindTargetAppToCurrentScript(front);
    await setOverlayVisible(true);
    await scriptStore.snapMaskToApp(front);
  }
};
const handleClearTargetApp = () => {
  if (script.value) {
    script.value.targetApp = undefined;
    scriptStore.addLog('info', '已解除目标应用绑定');
  }
};
const showOpenRegionModal = ref(false);
const isNewScript = computed(() => {
  return !scriptStore.scripts.value.some(s => s.id === script.value?.id);
});
const isInfiniteLoop = computed(() => {
  return script.value?.config.repeatCount === 0;
});
const setOverlayVisible = async (show: boolean) => {
  await maskStore.setVisible(show);
};
onUnmounted(async () => {
});
const handleBack = async () => {
  if (isDirty.value) {
    const choice = confirm('有未保存的修改，是否保存后再离开？\n\n点击「确定」保存并返回，点击「取消」放弃修改直接返回。');
    if (choice) {
      if (!script.value) return;
      if (!script.value.title.trim()) {
        script.value.title = '未命名自动化脚本';
      }
      scriptStore.saveCurrentScript();
    }
  }
  scriptStore.currentView.value = 'list';
};
const handleSave = async () => {
  if (!script.value) return;
  if (!script.value.title.trim()) {
    script.value.title = '未命名自动化脚本';
  }
  scriptStore.saveCurrentScript();
  await nextTick();
  markClean();
  justSaved.value = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    justSaved.value = false;
  }, 2000);
};
const toggleMask = async () => {
  const next = !maskStore.visible.value;
  if (next && script.value?.targetApp) {
    await automationController.ensureMaskAlignedToTargetApp(script.value.targetApp);
  } else {
    await setOverlayVisible(next);
  }
};
const toggleAllActions = (expanded: boolean) => {
  if (!script.value) return;
  script.value.actions.forEach(a => {
    a.isExpanded = expanded;
  });
};
const addNewAction = (type: ActionType = 'click_text') => {
  if (!script.value) return;
  if (!isWindowBound.value) {
    promptBindWindow();
    return;
  }
  const newAction = createDefaultAction(type);
  newAction.isExpanded = false;
  script.value.actions.push(newAction);
};
const handleTriggerRecord = async () => {
  if (!isWindowBound.value) {
    promptBindWindow();
    return;
  }
  await setOverlayVisible(true);
  await scriptStore.startRecording();
};
const moveAction = (index: number, delta: number) => {
  if (!script.value) return;
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= script.value.actions.length) return;
  const item = script.value.actions.splice(index, 1)[0];
  script.value.actions.splice(targetIndex, 0, item);
};
const removeAction = (index: number) => {
  if (!script.value) return;
  script.value.actions.splice(index, 1);
};
const handleRunCurrentScript = () => {
  const status = scriptStore.executionStatus.value;
  if (!script.value || status === 'running' || status === 'stopped' || status === 'paused') return;
  if (!maskStore.visible.value) {
    showOpenRegionModal.value = true;
    return;
  }
  scriptStore.runScript(script.value);
};
const handleStopCurrentScript = () => {
  scriptStore.stopScript();
};
const scrollToRunLog = () => {
  const el = document.querySelector('.run-log-panel');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const handleConfirmOpenRegionAndRun = async () => {
  showOpenRegionModal.value = false;
  if (!script.value) return;
  await setOverlayVisible(true);
  scriptStore.runScript(script.value);
};
</script>
