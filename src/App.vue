<template>
  <!-- 独立悬浮蒙版路由模式 (#overlay)：只渲染 RegionMaskOverlay -->
  <div
    v-if="isOverlayMode"
    class="w-screen h-screen bg-transparent fixed inset-0 overflow-hidden"
  >
    <RegionMaskOverlay />
  </div>

  <!-- 普通应用主窗口模式：全屏顶层垂直滚动容器，鼠标在任何位置均可顺畅滚动整个编辑 UI -->
  <div
    v-else
    id="main-scroll-container"
    class="w-full bg-claude-bg text-claude-text font-sans relative"
    style="height: 100vh; max-height: 100vh; overflow-y: auto !important; overflow-x: hidden;"
  >
    <component :is="activeComponent" />
    <UpdateModal
      :is-open="showStartupUpdate"
      :update-info="startupUpdateInfo"
      @close="showStartupUpdate = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { scriptStore } from './stores/scriptStore';
import ScriptsList from './components/ScriptsList.vue';
import AddEditScript from './components/AddEditScript.vue';
import SettingsView from './components/SettingsView.vue';
import AboutView from './components/AboutView.vue';
import RegionMaskOverlay from './components/RegionMaskOverlay.vue';

// 检查是否处于 #overlay 悬浮蒙版模式
const isOverlayMode = ref(
  typeof window !== 'undefined' && window.location.hash.includes('overlay')
);

const updateRouteMode = () => {
  isOverlayMode.value = typeof window !== 'undefined' && window.location.hash.includes('overlay');
  if (typeof document !== 'undefined') {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    if (isOverlayMode.value) {
      document.documentElement.classList.add('overlay-mode');
      document.body.classList.add('overlay-mode');
    } else {
      document.documentElement.classList.remove('overlay-mode');
      document.body.classList.remove('overlay-mode');
    }
  }
};

// 动态视图路由
const activeComponent = computed(() => {
  switch (scriptStore.currentView.value) {
    case 'edit':
      return AddEditScript;
    case 'settings':
      return SettingsView;
    case 'about':
      return AboutView;
    case 'list':
    default:
      return ScriptsList;
  }
});

import { maskStore, isTauriEnv } from './stores/maskStore';
import { invoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { cuaDriver } from './services/cuaDriverService';
import UpdateModal, { type UpdateInfo } from './components/UpdateModal.vue';

const showStartupUpdate = ref(false);
const startupUpdateInfo = ref<UpdateInfo | null>(null);

const handleEmergencyStop = () => {
  if (scriptStore.executionStatus.value === 'running' || scriptStore.executionStatus.value === 'paused') {
    scriptStore.stopScript();
  }
  if (scriptStore.isRecording.value) {
    scriptStore.stopRecording();
  }
  maskStore.cancelInteraction();
  maskStore.setSelectingMode(false);
};

if (typeof window !== 'undefined') {
  (window as any).__glimpse_emergency_stop = handleEmergencyStop;
  try {
    tauriListen('glimpse_emergency_stop', () => {
      handleEmergencyStop();
    }).catch(() => {});
  } catch (e) {}
}

// 全局键盘事件监听
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    handleEmergencyStop();
  }
};

onMounted(() => {
  updateRouteMode();
  window.addEventListener('hashchange', updateRouteMode);
  window.addEventListener('keydown', handleKeyDown);
  if (!isOverlayMode.value) {
    cuaDriver.start().catch((e) => console.warn('[cuaDriver] init failed:', e.message));
    const autoCheck = typeof localStorage === 'undefined' || localStorage.getItem('glimpse:auto_check_update') !== 'false';
    if (autoCheck && isTauriEnv()) {
      setTimeout(() => {
        invoke<UpdateInfo>('check_for_updates')
          .then((info) => {
            if (info?.has_update) {
              startupUpdateInfo.value = info;
              showStartupUpdate.value = true;
            }
          })
          .catch(() => {});
      }, 2500);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('hashchange', updateRouteMode);
  window.removeEventListener('keydown', handleKeyDown);
  cuaDriver.stop();
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
