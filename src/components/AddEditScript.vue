<template>
  <div v-if="script" class="min-h-full w-full flex flex-col bg-zinc-950 text-zinc-100 font-sans relative">
    <!-- ================= 顶部导航栏 ================= -->
    <header class="sticky top-0 z-30 px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md flex items-center justify-between shrink-0">
      <!-- 左侧：返回按钮 + 页面标题 -->
      <div class="flex items-center gap-3">
        <button
          @click="handleBack"
          class="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
          title="返回脚本列表"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div>
          <h1 class="text-base font-bold text-white flex items-center gap-2">
            {{ isNewScript ? '新建自动化脚本' : '编辑自动化脚本' }}
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              {{ script.actions.length }} 个动作
            </span>
          </h1>
          <p class="text-[11px] text-zinc-400">
            配置触发规则、OCR 视觉检索与精准点击动作
          </p>
        </div>
      </div>

      <!-- 右侧：启动独立桌面悬浮蒙版控制按钮 + 保存按钮 -->
      <div class="flex items-center gap-3">
        <!-- 需求 4.3: 「启动独立桌面悬浮蒙版」控制按钮 -->
        <button
          @click="toggleMask"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm"
          :class="
            scriptStore.showRegionMask.value
              ? 'bg-blue-600 text-white border-blue-500 shadow-blue-600/30'
              : 'bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800'
          "
          title="随时呼出或关闭系统级桌面透明悬浮蒙版 (置顶于桌面所有应用之上)"
        >
          <Layers class="w-3.5 h-3.5" :class="scriptStore.showRegionMask.value ? 'text-white' : 'text-blue-400'" />
          <span>{{ scriptStore.showRegionMask.value ? '关闭桌面悬浮蒙版' : '启动独立桌面悬浮蒙版' }}</span>
        </button>

        <!-- 保存按钮 -->
        <button
          @click="handleSave"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 border border-blue-400/30 active:scale-95 transition-all cursor-pointer"
        >
          <Save class="w-3.5 h-3.5" />
          <span>保存配置</span>
        </button>
      </div>
    </header>

    <!-- ================= 录制状态全局横幅 ================= -->
    <div
      v-if="scriptStore.isRecording.value"
      class="bg-red-500/15 border-b border-red-500/30 px-6 py-2 flex items-center justify-between shrink-0"
    >
      <div class="flex items-center gap-2 text-red-400 text-xs font-medium">
        <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
        <span>🔴 正在进行智能录制：在蒙版区域内点击任意位置，将自动采集屏幕坐标并追加动作</span>
      </div>
      <button
        @click="scriptStore.stopRecording"
        class="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
      >
        完成录制
      </button>
    </div>

    <!-- ================= 主内容滚动区域 ================= -->
    <div class="px-6 py-6 pb-36 space-y-6 flex-1 w-full">
      <!-- 1. 脚本命名与备注 -->
      <section class="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-zinc-800/60 text-xs font-semibold text-zinc-300">
          <FileText class="w-4 h-4 text-blue-400" />
          <span>脚本基础信息</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- 标题 -->
          <div class="md:col-span-1">
            <label class="block text-xs font-medium text-zinc-400 mb-1.5">脚本标题</label>
            <input
              v-model="script.title"
              type="text"
              placeholder="请输入清晰的脚本标题..."
              class="w-full px-3.5 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-700/80 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <!-- 备注 -->
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-zinc-400 mb-1.5">备注说明</label>
            <input
              v-model="script.notes"
              type="text"
              placeholder="例如：本脚本用于桌面日常登录或特定坐标快速连点..."
              class="w-full px-3.5 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-700/80 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
      </section>

      <!-- 2. 脚本全局设置 -->
      <section class="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-zinc-800/60 text-xs font-semibold text-zinc-300">
          <Sliders class="w-4 h-4 text-emerald-400" />
          <span>脚本全局设置</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <!-- 默认等待：输入框 + 步进器，默认 1.0 秒 -->
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1.5">默认等待 (秒)</label>
            <div class="flex items-center">
              <button
                type="button"
                @click="changeDefaultWait(-0.5)"
                class="px-2.5 py-2 rounded-l-xl bg-zinc-800 hover:bg-zinc-700 border border-r-0 border-zinc-700 text-zinc-300 transition-colors"
                title="减少 0.5s"
              >
                <Minus class="w-3.5 h-3.5" />
              </button>
              <input
                v-model.number="script.config.defaultWaitSeconds"
                type="number"
                step="0.1"
                min="0.1"
                class="w-full py-2 text-center text-xs bg-zinc-950 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                @click="changeDefaultWait(0.5)"
                class="px-2.5 py-2 rounded-r-xl bg-zinc-800 hover:bg-zinc-700 border border-l-0 border-zinc-700 text-zinc-300 transition-colors"
                title="增加 0.5s"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
            </div>
            <p class="text-[10px] text-zinc-500 mt-1">每个未单独指定等待的动作执行后默认延时</p>
          </div>

          <!-- 重复次数：输入框 + 无限循环勾选框，默认 1 次 -->
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1.5">重复次数</label>
            <div class="flex items-center">
              <button
                type="button"
                :disabled="isInfiniteLoop"
                @click="changeRepeatCount(-1)"
                class="px-2.5 py-2 rounded-l-xl bg-zinc-800 hover:bg-zinc-700 border border-r-0 border-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
              >
                <Minus class="w-3.5 h-3.5" />
              </button>
              <input
                v-if="!isInfiniteLoop"
                v-model.number="script.config.repeatCount"
                type="number"
                min="1"
                class="w-full py-2 text-center text-xs bg-zinc-950 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <div
                v-else
                class="w-full py-2 text-center text-xs bg-zinc-950 border border-zinc-700 text-amber-400 font-semibold"
              >
                ∞ 无限循环
              </div>
              <button
                type="button"
                :disabled="isInfiniteLoop"
                @click="changeRepeatCount(1)"
                class="px-2.5 py-2 rounded-r-xl bg-zinc-800 hover:bg-zinc-700 border border-l-0 border-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
            </div>
            <div class="mt-1 flex items-center">
              <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  :checked="isInfiniteLoop"
                  @change="toggleInfiniteLoop"
                  class="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-blue-500"
                />
                <span>无限循环 (按停止键结束)</span>
              </label>
            </div>
          </div>

          <!-- 有动作失败立即暂停：Toggle 开关，默认 true -->
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1.5">失败保护机制</label>
            <div class="flex items-center justify-between p-2 rounded-xl bg-zinc-950 border border-zinc-800">
              <span class="text-xs text-zinc-300">有动作失败立即暂停</span>
              <button
                type="button"
                @click="script.config.pauseOnFailure = !script.config.pauseOnFailure"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="script.config.pauseOnFailure ? 'bg-blue-600' : 'bg-zinc-800'"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                  :class="script.config.pauseOnFailure ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
            <p class="text-[10px] text-zinc-500 mt-1">遇到 OCR 文字未找到等异常时立即挂起，防止误触</p>
          </div>
        </div>
      </section>

      <!-- 3. 动作列表区域 -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <ListTree class="w-4 h-4 text-purple-400" />
            <span>编排执行动作流</span>
            <span class="text-zinc-500 font-normal">({{ script.actions.length }} 个步骤)</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="script.actions.length > 0"
              @click="toggleAllActions(true)"
              class="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              全部展开
            </button>
            <button
              v-if="script.actions.length > 0"
              @click="toggleAllActions(false)"
              class="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              全部收起
            </button>
          </div>
        </div>

        <!-- 空状态展示：若 actions.length === 0，展示醒目的居中卡片：“动作 未设置”，带有虚线框与说明 -->
        <div
          v-if="script.actions.length === 0"
          class="py-14 px-6 rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/20 flex flex-col items-center justify-center text-center"
        >
          <div class="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3 shadow-inner">
            <ListTree class="w-7 h-7" />
          </div>
          <h3 class="text-base font-bold text-zinc-200 mb-1">
            动作 未设置
          </h3>
          <p class="text-xs text-zinc-500 max-w-md mb-6 leading-relaxed">
            当前脚本还没有配置任何点击动作。您可以手动添加「点击文字 (OCR)」或「点击位置 (坐标)」，也可以点击「🔴 录制」直接在屏幕上点选生成！
          </p>

          <div class="flex items-center gap-3">
            <ActionCascadeMenu placement="bottom-left" @select="addNewAction">
              <template #trigger>
                <button
                  type="button"
                  class="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 border border-blue-400/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus class="w-4 h-4" />
                  <span>+ 添加一个动作 ▾</span>
                </button>
              </template>
            </ActionCascadeMenu>
            <button
              @click="handleTriggerRecord"
              class="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/20 border border-red-400/30 transition-all active:scale-95 cursor-pointer"
            >
              <CircleDot class="w-4 h-4" />
              <span>🔴 录制</span>
            </button>
          </div>
        </div>

        <!-- 动作卡片列表渲染 -->
        <div v-else class="space-y-3">
          <ActionRow
            v-for="(act, idx) in script.actions"
            :key="act.id"
            :action="act"
            :index="idx"
            :is-first="idx === 0"
            :is-last="idx === script.actions.length - 1"
            @move-up="moveAction(idx, -1)"
            @move-down="moveAction(idx, 1)"
            @delete="removeAction(idx)"
          />

          <!-- 最后一个动作下面：水平放置两个按钮 [+ 添加一个动作] 和 [🔴 录制] -->
          <div class="pt-3 flex items-center gap-3">
            <ActionCascadeMenu placement="top-left" class="flex-1" @select="addNewAction">
              <template #trigger>
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-blue-500/60 text-zinc-200 text-xs font-semibold transition-all active:scale-[0.99] shadow-sm cursor-pointer"
                >
                  <Plus class="w-4 h-4 text-blue-400" />
                  <span>+ 添加一个动作 (展开动作菜单 ▾)</span>
                </button>
              </template>
            </ActionCascadeMenu>

            <button
              @click="handleTriggerRecord"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-red-500/60 text-zinc-200 text-xs font-semibold transition-all active:scale-[0.99] shadow-sm cursor-pointer"
            >
              <CircleDot class="w-4 h-4 text-red-500" />
              <span>🔴 录制</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- ================= 右下角常驻运行控制大按钮 ================= -->
    <!-- 固定悬浮在页面右下角，大号胶囊形按钮（未运行时为醒目的「▶️ 运行」，运行时为「⏸️ 暂停」与「⏹️ 停止」） -->
    <div class="fixed bottom-6 right-6 z-40 flex items-center gap-2.5">
      <!-- 运行中状态控制组合 -->
      <template v-if="scriptStore.executionStatus.value === 'running'">
        <button
          @click="scriptStore.pauseScript"
          class="flex items-center gap-2 px-5 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-2xl shadow-amber-500/30 border border-amber-300 transition-all active:scale-95"
        >
          <Pause class="w-4 h-4 fill-zinc-950" />
          <span>暂停</span>
        </button>
        <button
          @click="scriptStore.stopScript"
          class="flex items-center gap-2 px-5 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-2xl shadow-red-600/30 border border-red-400 transition-all active:scale-95"
        >
          <Square class="w-4 h-4 fill-white" />
          <span>停止</span>
        </button>
      </template>

      <!-- 暂停状态控制组合 -->
      <template v-else-if="scriptStore.executionStatus.value === 'paused'">
        <button
          @click="scriptStore.resumeScript"
          class="flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-2xl shadow-emerald-500/30 border border-emerald-300 transition-all active:scale-95"
        >
          <Play class="w-4 h-4 fill-zinc-950" />
          <span>继续</span>
        </button>
        <button
          @click="scriptStore.stopScript"
          class="flex items-center gap-2 px-5 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-2xl shadow-red-600/30 border border-red-400 transition-all active:scale-95"
        >
          <Square class="w-4 h-4 fill-white" />
          <span>停止</span>
        </button>
      </template>

      <!-- 未运行状态：大号胶囊醒目「运行」按钮 -->
      <template v-else>
        <button
          @click="handleRunCurrentScript"
          :disabled="script.actions.length === 0"
          class="flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-2xl shadow-blue-600/40 border border-blue-300/40 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
        >
          <Play class="w-4 h-4 fill-white" />
          <span>运行脚本</span>
        </button>
      </template>
    </div>

    <!-- ================= 任务 2 场景二：运行前置拦截弹窗 (严格对标截图 2) ================= -->
    <div
      v-if="showOpenRegionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
    >
      <div class="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700/80 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        <!-- 弹窗标题 (严格对标截图 2) -->
        <h3 class="text-base font-bold text-white text-center">
          请先打开脚本运行屏幕区域
        </h3>

        <!-- 弹窗说明内容 (严格对标截图 2) -->
        <p class="text-xs text-zinc-400 text-center leading-relaxed px-2">
          所有 屏幕点击/屏幕识别 相关的脚本动作都将在设置的屏幕区域内运行，请确保运行区域完整覆盖目标屏幕内容
        </p>

        <!-- 底部两个按钮：[ 取消 ] 和 [ 打开 ] (严格对标截图 2) -->
        <div class="grid grid-cols-2 gap-3 pt-3">
          <button
            type="button"
            @click="showOpenRegionModal = false"
            class="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            @click="handleConfirmOpenRegionAndRun"
            class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-colors cursor-pointer"
          >
            打开
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  Save,
  Crosshair,
  FileText,
  Sliders,
  Minus,
  Plus,
  ListTree,
  CircleDot,
  Play,
  Pause,
  Square,
  Layers
} from 'lucide-vue-next';
import { scriptStore, createDefaultAction, isTauriEnv } from '../stores/scriptStore';
import ActionRow from './ActionRow.vue';
import ActionCascadeMenu from './ActionCascadeMenu.vue';
import type { AutomationScript, ActionType } from '../types/script';

const script = scriptStore.editingScript;

// 拦截弹窗状态 (对标截图 2)
const showOpenRegionModal = ref(false);

const isNewScript = computed(() => {
  return !scriptStore.scripts.value.some(s => s.id === script.value?.id);
});

const isInfiniteLoop = computed(() => {
  return script.value?.config.repeatCount === 0;
});

// 控制桌面透明独立蒙版窗口显示与隐藏
const setOverlayVisible = async (show: boolean) => {
  scriptStore.showRegionMask.value = show;
  if (show) {
    scriptStore.isMaskMinimized.value = false;
  }
  scriptStore.broadcastSync('visibility_updated', {
    show,
    isMinimized: scriptStore.isMaskMinimized.value,
    isFullscreen: scriptStore.isMaskFullscreen.value
  });
  if (isTauriEnv()) {
    try {
      await invoke('show_mask_overlay', { show });
    } catch (err) {
      console.warn('invoke show_mask_overlay 失败:', err);
    }
  }
};

// 任务 2 要求：取消 onMounted 自动呼出蒙版的逻辑！打开编辑页时，桌面蒙版默认隐藏关闭。

// 页面卸载时隐藏桌面蒙版窗口
onUnmounted(async () => {
  await setOverlayVisible(false);
});

// 返回
const handleBack = async () => {
  await setOverlayVisible(false);
  scriptStore.currentView.value = 'list';
};

// 保存
const handleSave = async () => {
  if (!script.value) return;
  if (!script.value.title.trim()) {
    script.value.title = '未命名自动化脚本';
  }
  scriptStore.saveCurrentScript();
  await setOverlayVisible(false);
  scriptStore.currentView.value = 'list';
};

// 切换蒙版显示
const toggleMask = async () => {
  const next = !scriptStore.showRegionMask.value;
  await setOverlayVisible(next);
};

// 默认等待加减步进
const changeDefaultWait = (delta: number) => {
  if (!script.value) return;
  const current = script.value.config.defaultWaitSeconds ?? 1.0;
  const next = Math.max(0.1, Math.round((current + delta) * 10) / 10);
  script.value.config.defaultWaitSeconds = next;
};

// 重复次数加减
const changeRepeatCount = (delta: number) => {
  if (!script.value || isInfiniteLoop.value) return;
  const current = script.value.config.repeatCount ?? 1;
  script.value.config.repeatCount = Math.max(1, current + delta);
};

// 切换无限循环
const toggleInfiniteLoop = (e: Event) => {
  if (!script.value) return;
  const target = e.target as HTMLInputElement;
  if (target.checked) {
    script.value.config.repeatCount = 0;
  } else {
    script.value.config.repeatCount = 1;
  }
};

// 展开/收起全部动作
const toggleAllActions = (expanded: boolean) => {
  if (!script.value) return;
  script.value.actions.forEach(a => {
    a.isExpanded = expanded;
  });
};

// 添加动作
const addNewAction = (type: ActionType = 'click_text') => {
  if (!script.value) return;
  const newAction = createDefaultAction(type);
  script.value.actions.push(newAction);
};

// 触发智能录制
const handleTriggerRecord = async () => {
  await setOverlayVisible(true);
  scriptStore.startRecording();
};

// 移动动作
const moveAction = (index: number, delta: number) => {
  if (!script.value) return;
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= script.value.actions.length) return;
  const item = script.value.actions.splice(index, 1)[0];
  script.value.actions.splice(targetIndex, 0, item);
};

// 删除动作
const removeAction = (index: number) => {
  if (!script.value) return;
  script.value.actions.splice(index, 1);
};

// 运行当前脚本 (任务 2 场景二: 检查是否已打开屏幕运行区域，未打开则拦截弹窗)
const handleRunCurrentScript = async () => {
  if (!script.value) return;
  // 检查桌面运行区域是否已经打开
  if (!scriptStore.showRegionMask.value) {
    showOpenRegionModal.value = true;
    return;
  }
  // 已打开则直接启动脚本
  scriptStore.runScript(script.value);
};

// 确认打开屏幕区域并启动运行 (严格对标截图 2 点击「打开」)
const handleConfirmOpenRegionAndRun = async () => {
  showOpenRegionModal.value = false;
  if (!script.value) return;
  await setOverlayVisible(true);
  scriptStore.runScript(script.value);
};
</script>
