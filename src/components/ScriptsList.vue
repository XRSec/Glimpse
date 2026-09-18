<template>
  <div class="h-full flex flex-col bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans">
    <!-- ================= 顶部状态栏与工具栏 ================= -->
    <header class="px-8 py-5 border-b border-white/[0.08] bg-[#121215]/80 backdrop-blur-xl backdrop-blur-md flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-2xl bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30 shadow-inner">
          <ScrollText class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-[#fbfaf8] flex items-center gap-2.5">
            自动化脚本库
            <span class="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#262320] text-[#a8a29e] border border-[#383430]">
              共 {{ scriptStore.scripts.value.length }} 个脚本
            </span>
          </h1>
          <p class="text-xs text-zinc-400 mt-0.5 mt-0.5">
            编排桌面自动化流程，支持 Apple Vision 原生 OCR 识别与精准坐标点击
          </p>
        </div>
      </div>

      <!-- 右上角操作区：搜索 + 关于入口 + 设置入口 + 醒目的「+ 添加脚本」按钮 -->
      <div class="flex items-center gap-3">
        <!-- 搜索输入框 -->
        <div class="relative">
          <Search class="w-4 h-4 text-[#78716c] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索脚本名称或备注..."
            class="pl-9 pr-4 py-2 text-xs rounded-2xl bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-[#da7756] focus:ring-1 focus:ring-[#da7756] w-60 transition-colors"
          />
            <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
          </div>

        <!-- 关于页面入口 -->
        <button
          @click="scriptStore.currentView.value = 'about'"
          class="p-2 rounded-2xl bg-[#24211e] hover:bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] border border-[#383430] transition-colors cursor-pointer"
          title="关于 Glimpse 灵眸 · XRSec"
        >
          <Info class="w-4 h-4" />
        </button>

        <!-- 系统设置按钮 -->
        <button
          @click="scriptStore.currentView.value = 'settings'"
          class="p-2 rounded-2xl bg-[#24211e] hover:bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] border border-[#383430] transition-colors cursor-pointer"
          title="系统权限与 OCR 说明"
        >
          <Settings class="w-4 h-4" />
        </button>

        <!-- 顶部常驻醒目的「+ 添加脚本」按钮 (Claude 陶土橙) -->
        <button
          @click="scriptStore.startCreateScript"
          class="flex items-center gap-2 px-4 py-2 rounded-2xl mac-button-primary text-white text-xs font-semibold shadow-lg shadow-[#da7756]/20 border border-[#da7756]/40 active:scale-95 transition-all cursor-pointer"
        >
          <Plus class="w-4 h-4" />
          <span>+ 添加脚本</span>
        </button>
      </div>
    </header>

    <!-- ================= 脚本卡片列表区域 ================= -->
    <div class="flex-1 overflow-y-auto px-8 py-6">
      <!-- 空状态展示 -->
      <div
        v-if="filteredScripts.length === 0"
        class="h-72 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#383430] p-8 text-center bg-[#211f1c]/30"
      >
        <div class="w-16 h-16 rounded-2xl bg-[#262320] border border-[#383430] flex items-center justify-center text-[#da7756] mb-4 shadow-inner">
          <ScrollText class="w-8 h-8" />
        </div>
        <h3 class="text-sm font-semibold text-[#fbfaf8] mb-1">
          {{ searchQuery ? '未找到匹配的自动化脚本' : '当前暂无脚本' }}
        </h3>
        <p class="text-xs text-zinc-400 mt-0.5 max-w-sm mb-5">
          {{ searchQuery ? '请尝试更换搜索关键字，或直接点击上方按钮新建脚本' : '您可以点击「+ 添加脚本」开始自由编排点击文字 (OCR) 与点击位置动作！' }}
        </p>
        <div class="flex items-center gap-3">
          <button
            @click="scriptStore.startCreateScript"
            class="flex items-center gap-2 px-4 py-2 rounded-2xl mac-button-primary text-white text-xs font-medium transition-all shadow-md shadow-[#da7756]/20 cursor-pointer"
          >
            <Plus class="w-4 h-4" />
            新建第一个脚本
          </button>
        </div>
      </div>

      <!-- 脚本卡片流展示 -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <div
          v-for="script in filteredScripts"
          :key="script.id"
          class="mac-obsidian-card mac-obsidian-card-hover rounded-2xl p-5 flex flex-col justify-between relative group cursor-pointer"
          :class="isScriptRunning(script.id) ? 'border-[#da7756] ring-1 ring-[#da7756]/40 bg-[#da7756]/5' : ''"
        >
          <!-- 运行中发光脉冲提示 -->
          <div
            v-if="isScriptRunning(script.id)"
            class="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#da7756]/20 border border-[#da7756]/40 text-[#da7756] text-[10px] font-medium"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-ping"></span>
            <span>正在执行</span>
          </div>

          <!-- 卡片上半部分：标题与备注 -->
          <div>
            <div class="flex items-start justify-between gap-3 mb-2">
              <h3 class="text-xl font-bold tracking-tight text-white group-hover:text-[#da7756] transition-colors line-clamp-1">
                {{ script.title }}
              </h3>
            </div>

            <p class="text-xs text-zinc-400 mt-0.5 line-clamp-2 min-h-[32px] mb-4">
              {{ script.notes || '暂无详细备注说明...' }}
            </p>

                        <!-- 核心全局设置标签流：动作数、全局等待时间、重复次数、失败立即暂停状态 -->
            <div class="flex flex-wrap gap-2 mb-4">
              <!-- 动作数 -->
              <span class="mac-tag-capsule">
                <ListTree class="w-3 h-3 mr-1 text-zinc-400" />
                {{ script.actions.length }} 个动作
              </span>

              <!-- 全局等待时间 -->
              <span class="mac-tag-capsule">
                <Clock class="w-3 h-3 mr-1 text-zinc-400" />
                等待 {{ (script.config.defaultWaitSeconds ?? 1.0).toFixed(1) }}s
              </span>

              <!-- 重复次数 -->
              <span class="mac-tag-capsule">
                <Repeat class="w-3 h-3 mr-1 text-zinc-400" />
                {{ script.config.repeatCount === 0 ? '无限循环' : `循环 ${script.config.repeatCount} 次` }}
              </span>

              <!-- 失败立即暂停状态 -->
              <span class="mac-tag-capsule">
                <AlertCircle class="w-3 h-3 mr-1 text-zinc-400" />
                {{ script.config.pauseOnFailure ? '失败暂停: 开' : '失败暂停: 关' }}
              </span>
            </div>
          </div>

          <!-- 卡片下半部分：底部信息与操作按钮 -->
          <div class="pt-3 border-t border-white/[0.06] flex items-center justify-between">
            <span class="text-[11px] text-zinc-500 font-mono">
              更新于 {{ formatTime(script.updatedAt) }}
            </span>

            <!-- 右侧操作组：「编辑」按钮与「▶️ 运行」按钮 -->
            <div class="flex items-center gap-2">
              <!-- 克隆与删除辅助按钮 -->
              <button
                @click="scriptStore.duplicateScript(script)"
                class="p-1.5 rounded-lg text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors cursor-pointer"
                title="克隆脚本"
              >
                <Copy class="w-3.5 h-3.5" />
              </button>
              <button
                @click="scriptStore.deleteScript(script.id)"
                class="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                title="删除脚本"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>

              <!-- 编辑按钮 -->
              <button
                @click="handleEdit(script)"
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08] text-xs font-medium transition-all"
              >
                <Edit3 class="w-3.5 h-3.5" />
                <span>编辑</span>
              </button>

              <!-- ▶️ 运行按钮 -->
              <button
                v-if="!isScriptRunning(script.id)"
                @click="handleRun(script)"
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-all shadow-sm"
              >
                <Play class="w-3.5 h-3.5 fill-white" />
                <span>运行</span>
              </button>
              <!-- ⏸ 暂停状态：继续 + 停止 -->
              <template v-else-if="isScriptPaused(script.id)">
                <button
                  @click="scriptStore.resumeScript"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-all shadow-sm"
                >
                  <Play class="w-3.5 h-3.5 fill-white" />
                  <span>继续</span>
                </button>
                <button
                  @click="scriptStore.stopScript"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-600/20 border border-red-400/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Square class="w-3.5 h-3.5 fill-white" />
                  <span>停止</span>
                </button>
              </template>
              <!-- ⏹ 运行中/停止过渡：停止按钮 -->
              <button
                v-else
                @click="scriptStore.stopScript"
                :disabled="scriptStore.executionStatus.value === 'stopped'"
                class="flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-600/20 border border-red-400/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square class="w-3.5 h-3.5 fill-white" />
                <span>{{ scriptStore.executionStatus.value === 'stopped' ? '已停止' : '停止' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= 运行前置拦截弹窗 ================= -->
    <div
      v-if="showOpenRegionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
    >
      <div class="w-full max-w-md rounded-2xl bg-[#211f1c] border border-[#383430] p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        <!-- 弹窗标题 -->
        <h3 class="text-xl font-bold tracking-tight text-white text-center">
          请先打开脚本运行屏幕区域
        </h3>

        <!-- 弹窗说明内容 -->
        <p class="text-xs text-zinc-400 mt-0.5 text-center leading-relaxed px-2">
          所有 屏幕点击/屏幕识别 相关的脚本动作都将在设置的屏幕区域内运行，请确保运行区域完整覆盖目标屏幕内容
        </p>

        <!-- 底部两个按钮：[ 取消 ] 和 [ 打开 ] -->
        <div class="grid grid-cols-2 gap-3 pt-3">
          <button
            type="button"
            @click="showOpenRegionModal = false"
            class="w-full py-2.5 rounded-2xl mac-button-secondary text-[#d5cdc4] text-xs font-semibold border border-[#383430] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            @click="handleConfirmOpenRegionAndRun"
            class="w-full py-2.5 rounded-2xl mac-button-primary text-white text-xs font-semibold shadow-lg shadow-[#da7756]/20 transition-colors cursor-pointer"
          >
            打开
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  ScrollText,
  Search,
  Plus,
  Settings,
  Info,
  ListTree,
  Clock,
  Repeat,
  AlertCircle,
  Edit3,
  Play,
  Square,
  Copy,
  Trash2
} from 'lucide-vue-next';
import { scriptStore } from '../stores/scriptStore';
import { maskStore } from '../stores/maskStore';
import type { AutomationScript } from '../types/script';

const searchQuery = ref('');
const showOpenRegionModal = ref(false);
const pendingRunScript = ref<AutomationScript | null>(null);

// 过滤脚本列表
const filteredScripts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return scriptStore.scripts.value;
  return scriptStore.scripts.value.filter(s =>
    s.title.toLowerCase().includes(query) || (s.notes && s.notes.toLowerCase().includes(query))
  );
});

// 检查某个脚本是否正在运行中（包括暂停、停止过渡状态）
const isScriptRunning = (id: string) => {
  return (
    (scriptStore.executionStatus.value === 'running' || scriptStore.executionStatus.value === 'paused' || scriptStore.executionStatus.value === 'stopped') &&
    scriptStore.runningScript.value?.id === id
  );
};

const isScriptPaused = (id: string) => {
  return (
    scriptStore.executionStatus.value === 'paused' &&
    scriptStore.runningScript.value?.id === id
  );
};

// 格式化时间
const formatTime = (ts: number) => {
  if (!ts) return '未知';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 编辑脚本
const handleEdit = (script: AutomationScript) => {
  scriptStore.startEditScript(script);
};

// 运行脚本 (检查是否已打开屏幕运行区域，未打开则拦截弹窗)
const handleRun = async (script: AutomationScript) => {
  if (!maskStore.visible.value) {
    pendingRunScript.value = script;
    showOpenRegionModal.value = true;
    return;
  }
  scriptStore.runScript(script);
};

// 确认打开屏幕区域并启动运行
const handleConfirmOpenRegionAndRun = async () => {
  showOpenRegionModal.value = false;
  if (!pendingRunScript.value) return;
  await maskStore.setVisible(true);
  scriptStore.runScript(pendingRunScript.value);
  pendingRunScript.value = null;
};
</script>
