<template>
<header class="sticky top-0 z-30 px-8 py-4 border-b border-claude-border bg-claude-header/80 backdrop-blur-xl flex items-center justify-between shrink-0">
      <!-- 左侧：返回按钮 + 页面标题 -->
      <div class="flex items-center gap-3">
        <button
          @click="$emit('back')"
          class="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.04] border border-white/[0.08] transition-colors cursor-pointer"
          title="返回脚本列表"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div>
          <h1 class="text-base font-bold text-white flex items-center gap-2">
            <template v-if="isEditingTitle">
              <input 
                v-model="script.title"
                ref="titleInput"
                @blur="finishTitleEdit"
                @keydown.enter="finishTitleEdit"
                @keydown.esc="cancelTitleEdit"
                class="bg-transparent border-b border-[#da7756] focus:outline-none px-1 py-0 w-48 text-base font-bold text-white"
              />
            </template>
            <template v-else>
              <span class="cursor-text select-text" @dblclick="enableTitleEdit">{{ script.title || '未命名脚本' }}</span>
              <button @click="enableTitleEdit" class="p-1 rounded text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors" title="编辑标题">
                <Pencil class="w-3.5 h-3.5" />
              </button>
            </template>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
              {{ script.actions.length }} 个动作
            </span>
          </h1>
          <p class="text-[11px] text-zinc-300">
            配置目标应用基准、OCR 视觉检索与精准点击动作
          </p>
        </div>
      </div>

      <!-- 右侧：启动独立桌面悬浮蒙版控制按钮 + 保存按钮 -->
      <div class="flex items-center gap-3">
        <!-- 桌面悬浮蒙版控制按钮 -->
        <button
          type="button"
          @click="$emit('toggle-mask')"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
          :class="
            isMaskOpen
              ? 'bg-[#da7756] text-white border-[#da7756] shadow-md shadow-[#da7756]/20'
              : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.04]'
          "
          :title="isMaskOpen ? '点击关闭蒙版' : '点击打开蒙版'"
        >
          <Layers class="w-3.5 h-3.5" :class="isMaskOpen ? 'text-white' : 'text-[#da7756]'" />
          <span>{{ isMaskOpen ? '关闭蒙版' : '打开蒙版' }}</span>
        </button>

        <!-- 保存按钮 (有修改时为醒目珊瑚橙，无修改时弱化为深色) -->
        <button
          @click="$emit('save')"
          :disabled="!isDirty && !justSaved"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
          :class="
            justSaved
              ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 shadow-sm'
              : isDirty
                ? 'bg-[#da7756] hover:bg-[#e28465] text-white shadow-lg shadow-[#da7756]/25 border-[#da7756]/50 active:scale-95 cursor-pointer'
                : 'bg-white/[0.04] text-[#78716c] border-white/[0.08] cursor-not-allowed opacity-70'
          "
          :title="isDirty ? '配置已更改，点击保存' : '当前所有配置已是最新，无待保存修改'"
        >
          <Check v-if="justSaved" class="w-3.5 h-3.5 text-emerald-400" />
          <Save v-else class="w-3.5 h-3.5" :class="isDirty ? 'text-white' : 'text-[#78716c]'" />
          <span>{{ justSaved ? '已保存' : isDirty ? '保存配置' : '已是最新' }}</span>
          <span v-if="isDirty" class="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        </button>
      </div>
    </header>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { ArrowLeft, Layers, Save, Check, Pencil } from 'lucide-vue-next';
import type { AutomationScript } from '../../types/script';

const props = defineProps<{
  script: AutomationScript;
  isNewScript: boolean;
  isMaskOpen: boolean;
  isDirty: boolean;
  justSaved: boolean;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'toggle-mask'): void;
  (e: 'save'): void;
}>();

const isEditingTitle = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
let originalTitle = '';

const enableTitleEdit = () => {
  if (!props.script) return;
  originalTitle = props.script.title || '';
  isEditingTitle.value = true;
  nextTick(() => {
    if (titleInput.value) {
      titleInput.value.focus();
      titleInput.value.select();
    }
  });
};

const finishTitleEdit = () => {
  isEditingTitle.value = false;
};

const cancelTitleEdit = () => {
  if (props.script) props.script.title = originalTitle;
  isEditingTitle.value = false;
};
</script>
