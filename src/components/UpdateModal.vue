<template>
  <div
    v-if="isOpen && updateInfo"
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div class="w-full max-w-md rounded-2xl border border-[#383430] bg-[#211f1c] shadow-2xl overflow-hidden text-[#fbfaf8]">
      <!-- 头部 -->
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-[#383430]">
        <div class="flex items-center gap-2 text-sm font-bold">
          <Download class="w-4 h-4 text-[#da7756]" />
          <span>发现新版本</span>
        </div>
        <button
          @click="$emit('close')"
          :disabled="downloading"
          class="p-1.5 rounded-lg text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors cursor-pointer disabled:opacity-40"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 主体 -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="text-[#a8a29e]">当前版本: <span class="font-mono text-[#d5cdc4]">v{{ updateInfo.current_version }}</span></span>
          <span class="text-[#da7756] font-semibold">最新版本: <span class="font-mono">v{{ updateInfo.latest_version }}</span></span>
        </div>

        <div v-if="updateInfo.published_at" class="flex items-center gap-1.5 text-[11px] text-[#78716c]">
          <Info class="w-3.5 h-3.5" />
          <span>发布时间: {{ formatDate(updateInfo.published_at) }}</span>
        </div>

        <div class="space-y-1.5">
          <span class="text-xs font-semibold text-[#d5cdc4]">更新说明</span>
          <div class="p-3 rounded-xl bg-[#191716] border border-[#383430] text-xs text-[#a8a29e] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
            {{ updateInfo.release_notes || '优化性能与稳定性，建议更新至最新版本。' }}
          </div>
        </div>

        <div v-if="error" class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          更新失败: {{ error }}
        </div>

        <div v-if="downloading" class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-[11px] text-[#a8a29e] font-medium">
            <span>正在下载安装包...</span>
            <span class="font-mono text-[#da7756]">{{ progress.percent.toFixed(1) }}%</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-[#191716] overflow-hidden border border-[#383430]">
            <div
              class="h-full bg-[#da7756] transition-all duration-200 ease-out"
              :style="{ width: `${Math.min(100, progress.percent)}%` }"
            />
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="px-5 py-3 bg-[#191716]/70 border-t border-[#383430] flex items-center justify-end gap-2">
        <button
          @click="$emit('close')"
          :disabled="downloading"
          class="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors cursor-pointer disabled:opacity-40"
        >
          稍后再说
        </button>
        <button
          v-if="updateInfo.asset_download_url && updateInfo.asset_name"
          @click="handleUpdate"
          :disabled="downloading"
          class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#da7756] hover:bg-[#e28465] text-white transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
        >
          <Loader2 v-if="downloading" class="w-3.5 h-3.5 animate-spin" />
          <span>{{ downloading ? '下载安装中...' : '立即更新并重启' }}</span>
        </button>
        <button
          v-else
          @click="openReleasePage"
          class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#da7756] hover:bg-[#e28465] text-white transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          <span>前往下载</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Download, X, Info, Loader2, ExternalLink } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openExternalUrl } from '../stores/scriptStore';

export interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_name: string;
  release_notes: string;
  release_url: string;
  published_at: string;
  asset_name?: string | null;
  asset_download_url?: string | null;
  asset_size?: number | null;
}

const props = defineProps<{
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const downloading = ref(false);
const error = ref('');
const progress = ref({ downloaded: 0, total: 0, percent: 0 });
let unlisten: UnlistenFn | null = null;

onMounted(async () => {
  try {
    unlisten = await listen<{ downloaded: number; total: number; percent: number }>(
      'update-download-progress',
      (event) => {
        progress.value = event.payload;
      }
    );
  } catch {}
});

onUnmounted(() => {
  if (unlisten) unlisten();
});

const formatDate = (iso: string) => {
  if (!iso) return '';
  return iso.slice(0, 10);
};

const handleUpdate = async () => {
  if (!props.updateInfo?.asset_download_url || !props.updateInfo?.asset_name) return;
  try {
    downloading.value = true;
    error.value = '';
    progress.value = { downloaded: 0, total: 0, percent: 0 };
    await invoke('download_and_install_update', {
      downloadUrl: props.updateInfo.asset_download_url,
      fileName: props.updateInfo.asset_name
    });
  } catch (e: any) {
    error.value = e?.message || String(e);
    downloading.value = false;
  }
};

const openReleasePage = () => {
  if (props.updateInfo?.release_url) {
    openExternalUrl(props.updateInfo.release_url);
  }
};
</script>
