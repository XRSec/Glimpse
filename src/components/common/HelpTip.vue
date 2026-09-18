<template>
  <div class="relative inline-flex items-center">
    <button
      ref="buttonRef"
      type="button"
      @click="toggle"
      class="text-zinc-500 hover:text-[#da7756] transition-colors ml-1 p-0.5 rounded cursor-pointer shrink-0"
      :title="text"
    >
      <HelpCircle class="w-3.5 h-3.5" />
    </button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        :style="popoverStyle"
        class="fixed z-[9999] px-3 py-2 text-[11px] bg-[#1c1a17] text-zinc-200 border border-white/15 rounded-xl shadow-2xl shadow-black/80 w-56 leading-relaxed select-text"
      >
        <div class="text-zinc-300 font-medium mb-1 flex items-center justify-between border-b border-white/[0.08] pb-1">
          <span class="text-xs text-[#da7756]">{{ title || '配置说明' }}</span>
          <button @click="isOpen = false" class="text-zinc-500 hover:text-zinc-300 text-sm leading-none cursor-pointer">×</button>
        </div>
        <div class="text-zinc-400 text-[11px] leading-normal">{{ text }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { HelpCircle } from 'lucide-vue-next';

defineProps<{
  text: string;
  title?: string;
}>();

const isOpen = ref(false);
const buttonRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const popoverStyle = ref({ top: '0px', left: '0px' });

const toggle = async () => {
  if (!isOpen.value && buttonRef.value) {
    const rect = buttonRef.value.getBoundingClientRect();
    // Popup below the button
    const left = Math.max(16, Math.min(window.innerWidth - 240, rect.left + rect.width / 2 - 112));
    const top = rect.bottom + 6;
    
    // Check if it goes off the bottom of the screen
    popoverStyle.value = { top: `${top}px`, left: `${left}px` };
    isOpen.value = true;
    
    // Adjust if needed after render
    await nextTick();
    if (popoverRef.value) {
      const popRect = popoverRef.value.getBoundingClientRect();
      if (popRect.bottom > window.innerHeight) {
        popoverStyle.value.top = `${rect.top - popRect.height - 6}px`;
      }
    }
  } else {
    isOpen.value = false;
  }
};

const handleDocClick = (e: MouseEvent) => {
  if (!isOpen.value) return;
  const target = e.target as Node;
  if (buttonRef.value?.contains(target) || popoverRef.value?.contains(target)) {
    return;
  }
  isOpen.value = false;
};

// Also handle window resize/scroll to close popup for safety
const handleScrollOrResize = () => {
  if (isOpen.value) isOpen.value = false;
};

onMounted(() => {
  window.addEventListener('click', handleDocClick);
  window.addEventListener('resize', handleScrollOrResize);
  window.addEventListener('scroll', handleScrollOrResize, true); // true to catch scrolling in overflow containers
});
onUnmounted(() => {
  window.removeEventListener('click', handleDocClick);
  window.removeEventListener('resize', handleScrollOrResize);
  window.removeEventListener('scroll', handleScrollOrResize, true);
});
</script>
