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
    class="w-full bg-zinc-950 text-zinc-100 font-sans relative"
    style="height: 100vh; max-height: 100vh; overflow-y: auto !important; overflow-x: hidden;"
  >
    <component :is="activeComponent" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { scriptStore } from './stores/scriptStore';
import ScriptsList from './components/ScriptsList.vue';
import AddEditScript from './components/AddEditScript.vue';
import SettingsView from './components/SettingsView.vue';
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
    case 'list':
    default:
      return ScriptsList;
  }
});

// 全局键盘事件监听
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (scriptStore.isRecording.value) {
      scriptStore.stopRecording();
    }
  }
};

onMounted(() => {
  updateRouteMode();
  window.addEventListener('hashchange', updateRouteMode);
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('hashchange', updateRouteMode);
  window.removeEventListener('keydown', handleKeyDown);
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
