<template>
<!-- ================= 运行中应用选择弹窗 (Claude 风格) ================= -->
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4"
    >
      <div class="w-full max-w-lg rounded-2xl bg-[#262320] border border-[#383430] p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between pb-3 border-b border-[#383430] shrink-0">
          <div class="flex items-center gap-2">
            <AppWindow class="w-4 h-4 text-emerald-400" />
            <h3 class="text-sm font-bold text-[#fbfaf8]">选择要绑定的运行中应用窗口</h3>
          </div>
          <button
            type="button"
            @click="$emit('close')"
            class="p-1 rounded-lg text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] transition-colors cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="flex items-center justify-between gap-2 shrink-0">
          <p class="text-xs text-[#a8a29e]">
            系统检测到当前打开的桌面应用窗口，点击任意一项即可绑定并记录宽高：
          </p>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              @click="$emit('detect-frontmost')"
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#da7756]/15 hover:bg-[#da7756]/25 text-[#da7756] border border-[#da7756]/30 text-[11px] font-semibold transition-colors cursor-pointer"
              title="自动抓取当前前台活动的应用并绑定"
            >
              <Crosshair class="w-3 h-3" />
              <span>自动抓取前台</span>
            </button>
            <button
              type="button"
              @click="$emit('refresh')"
              class="p-1 rounded-lg bg-[#211f1c] hover:bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] border border-[#383430] transition-colors cursor-pointer"
              title="重新扫描刷新应用列表"
            >
              <RotateCcw class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 列表容器 -->
        <div class="space-y-2 overflow-y-auto flex-1 pr-1">
          <div
            v-if="runningAppsList.length === 0"
            class="py-8 text-center text-xs text-[#78716c]"
          >
            正在扫描当前活动应用窗口...
          </div>
          <div
            v-for="appItem in runningAppsList"
            :key="`${appItem.pid}-${appItem.appName}`"
            @click="$emit('select-app', appItem)"
            class="p-3 rounded-xl bg-[#1c1a17] hover:bg-[#2c2825] border border-[#383430] hover:border-[#da7756]/60 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div class="min-w-0 flex-1 mr-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-[#fbfaf8] group-hover:text-[#da7756] transition-colors">
                  {{ appItem.appName }}
                </span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-[#262320] text-[#a8a29e] font-mono border border-[#383430]">
                  PID: {{ appItem.pid }}
                </span>
              </div>
              <p class="text-[11px] text-[#a8a29e] truncate mt-0.5" :title="appItem.windowTitle">
                {{ appItem.windowTitle || '(主窗口)' }}
              </p>
            </div>

            <div class="text-right shrink-0">
              <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/20">
                {{ appItem.width }} × {{ appItem.height }}
              </span>
              <span class="block text-[10px] text-[#78716c] font-mono mt-0.5">
                ({{ appItem.x }}, {{ appItem.y }})
              </span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-[#383430] flex justify-end shrink-0">
          <button
            type="button"
            @click="$emit('close')"
            class="px-4 py-2 rounded-xl bg-[#211f1c] hover:bg-[#2c2825] text-[#a8a29e] hover:text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-colors cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>

    
</template>
<script setup lang="ts">
import { AppWindow, X, Crosshair, RotateCcw } from 'lucide-vue-next';
defineProps<{ show: boolean; runningAppsList: any[] }>();
defineEmits(['close', 'detect-frontmost', 'refresh', 'select-app']);
</script>