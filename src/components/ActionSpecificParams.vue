<template>
  <div class="space-y-3">
    <!-- 1. 点击文字 (click_text) -->
    <div v-if="action.type === 'click_text' || action.type === 'identify_text'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <div class="col-span-2">
          <label class="block text-[11px] text-[#a8a29e] mb-1">目标文字</label>
          <input
            v-model="(action as any).targetText"
            type="text"
            placeholder="例如：确定 / 登录 / 提交"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-[#da7756] font-mono"
          />
        </div>
        <div>
          <label class="flex items-center text-[11px] text-[#a8a29e] mb-1"><span>匹配方式</span><HelpTip title="模糊匹配" text="开启后，当屏幕文字存在轻微光晕、缩放变形或 OCR 字符微小偏差时仍可模糊匹配命中。" /></label>
          <label class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#191716] border border-[#383430] text-xs text-[#d5cdc4] cursor-pointer">
            <input
              v-model="(action as any).fuzzyMatch"
              type="checkbox"
              class="rounded bg-[#191716] border-[#383430] text-[#da7756] focus:ring-[#da7756]"
            />
            <span>模糊匹配</span>
          </label>
        </div>
        <div>
          <label class="flex items-center text-[11px] text-[#a8a29e] mb-1"><span>识别模式</span><HelpTip title="识别模式" text="本地 (Vision) 调用 macOS 原生 Apple Vision 引擎，极速离线识别；云端模式调用多模态大模型分析。" /></label>
          <select
            :value="'local'"
            disabled
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#191716]/60 border border-[#383430] text-[#a8a29e] cursor-not-allowed font-mono opacity-80"
            title="云端识别模式暂未开放，当前已锁定为 Apple Vision 原生极速离线识别引擎"
          >
            <option value="local">本地 (Vision)</option>
            <option value="cloud" disabled>云端大模型 (暂未开放)</option>
          </select>
        </div>
        <div class="col-span-2 sm:col-span-2">
          <label class="flex items-center text-[11px] text-[#a8a29e] mb-1"><span>截图缩放</span><HelpTip title="截图缩放" text="降采样缩放比 (0.5 ~ 1.0)。0.5 为快速降采样，大幅加速 OCR 查找；1.0 为物理原始分辨率，最高识别精度。" /></label>
          <input type="number" min="0.5" max="1.0" step="0.05" v-model.number="action.ocrImageScale" placeholder="1.0" class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#161619] border border-white/[0.08] text-zinc-100 font-mono focus:border-[#da7756] focus:outline-none" @blur="clampOcrScale" />
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#383430]/60">
        <div v-if="action.type === 'click_text'">
          <label class="flex items-center text-[11px] text-[#a8a29e] mb-1"><span>触发按键</span><HelpTip title="触发按键" text="目标定位成功后派发的底层鼠标事件：左键单击、左键双击或呼出右键菜单。" /></label>
          <select
            v-model="(action as ClickTextAction).button"
            class="w-full px-2 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] focus:border-[#da7756]"
          >
            <option value="left">左键单击</option>
            <option value="double">左键双击</option>
            <option value="right">右键单击</option>
          </select>
        </div>
        <div>
          <label class="flex items-center text-[11px] text-[#a8a29e] mb-1"><span>点击偏移 X (px)</span><HelpTip title="点击偏移" text="以识别目标中心点为基准的相对像素偏移量。X 正数向右/负数向左，Y 正数向下/负数向上。" /></label>
          <input
            v-model.number="(action as any).offsetX"
            type="number"
            placeholder="0"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
          />
        </div>
        <div>
          <label class="block text-[11px] text-[#a8a29e] mb-1">点击偏移 Y (px)</label>
          <input
            v-model.number="(action as any).offsetY"
            type="number"
            placeholder="0"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
          />
        </div>
        <div>
          <label class="block text-[11px] text-[#a8a29e] mb-1">查找超时 (秒)</label>
          <input
            v-model.number="(action as any).timeoutSeconds"
            type="number"
            placeholder="5"
            class="w-full px-2.5 py-1 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
          />
        </div>
      </div>
    </div>

    <!-- 2. 点击指定坐标 (click_position) -->
    <div v-else-if="action.type === 'click_position'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <div class="flex items-center justify-between pb-1 border-b border-[#383430]">
        <span class="text-xs font-semibold text-[#da7756] flex items-center gap-1.5">
          <Crosshair class="w-3.5 h-3.5 text-[#da7756]" />
          坐标点击参数
        </span>
        <button
          type="button"
          @click="handlePickPoint('x,y')"
          class="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#da7756]/15 hover:bg-[#da7756]/25 text-[#da7756] border border-[#da7756]/30 text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-sm"
          title="在屏幕蒙版上直接点选目标位置回填坐标"
        >
          <Crosshair class="w-3.5 h-3.5 text-[#da7756]" />
          <span>🎯 拾取位置</span>
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-[#a8a29e] mb-1">X 坐标 (px)</label>
          <input
            v-model.number="(action as ClickPositionAction).x"
            type="number"
            placeholder="500"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
          />
        </div>
        <div>
          <label class="block text-xs text-[#a8a29e] mb-1">Y 坐标 (px)</label>
          <input
            v-model.number="(action as ClickPositionAction).y"
            type="number"
            placeholder="300"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
          />
        </div>
        <div>
          <label class="block text-xs text-[#a8a29e] mb-1">点击按键</label>
          <select
            v-model="(action as ClickPositionAction).button"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] focus:border-[#da7756]"
          >
            <option value="left">左键单击</option>
            <option value="double">左键双击</option>
            <option value="right">右键单击</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 3. 拖动直线 (drag_line) -->
    <div v-else-if="action.type === 'drag_line'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2.5">
      <div class="flex items-center justify-between pb-1 border-b border-[#383430]">
        <span class="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
          <ArrowUpRight class="w-3.5 h-3.5 text-emerald-400" />
          拖动直线轨迹参数 (从起点拖到终点)
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handlePickPoint('startX,startY')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair class="w-3 h-3" />
            <span>🎯 拾取起点</span>
          </button>
          <button
            type="button"
            @click="handlePickPoint('endX,endY')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair class="w-3 h-3" />
            <span>🎯 拾取终点</span>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div v-for="f in lineFields" :key="f.key">
          <label class="block text-xs text-[#a8a29e] mb-1">{{ f.label }}</label>
          <input
            v-model.number="(action as any)[f.key]"
            type="number"
            :step="f.step"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-emerald-500"
          />
        </div>
      </div>
    </div>

    <!-- 4. 拖动曲线 (drag_curve) -->
    <div v-else-if="action.type === 'drag_curve'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2.5">
      <div class="flex items-center justify-between pb-1 border-b border-[#383430]">
        <span class="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
          <Spline class="w-3.5 h-3.5 text-purple-400" />
          拖动曲线参数 (起点 → 贝塞尔拐点 → 终点)
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handlePickPoint('startX,startY')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair class="w-3 h-3" />
            <span>🎯 拾取起点</span>
          </button>
          <button
            type="button"
            @click="handlePickPoint('controlX,controlY')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair class="w-3 h-3" />
            <span>🎯 拾取拐点</span>
          </button>
          <button
            type="button"
            @click="handlePickPoint('endX,endY')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair class="w-3 h-3" />
            <span>🎯 拾取终点</span>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <div v-for="f in curveFields" :key="f.key">
          <label class="block text-xs mb-1" :class="f.class">{{ f.label }}</label>
          <input
            v-model.number="(action as any)[f.key]"
            type="number"
            :step="f.step"
            class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] font-mono"
            :class="f.inputClass"
          />
        </div>
      </div>
    </div>

    <!-- 5. 鼠标滚动 (scroll) -->
    <div v-else-if="action.type === 'scroll'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2.5">
      <div class="flex items-center justify-between pb-1 border-b border-[#383430]">
        <span class="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
          <Mouse class="w-3.5 h-3.5 text-cyan-400" />
          鼠标滚轮滚动配置
        </span>
        <button
          type="button"
          @click="handlePickPoint('targetX,targetY')"
          class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
        >
          <Crosshair class="w-3 h-3" />
          <span>🎯 拾取滚轮位置</span>
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs font-medium text-[#d5cdc4] mb-1.5">滚动方向</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              @click="(action as ScrollAction).direction = 'up'"
              class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center"
              :class="(action as ScrollAction).direction === 'up' ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300' : 'bg-[#191716] border-[#383430] text-[#a8a29e]'"
            >▲ 向上</button>
            <button
              type="button"
              @click="(action as ScrollAction).direction = 'down'"
              class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center"
              :class="(action as ScrollAction).direction === 'down' ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300' : 'bg-[#191716] border-[#383430] text-[#a8a29e]'"
            >▼ 向下</button>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[#d5cdc4] mb-1.5">滚动步数</label>
          <div class="relative">
            <input v-model.number="(action as ScrollAction).distance" type="number" min="1" max="100" placeholder="5" class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-cyan-500" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#78716c]">步</span>
          </div>
        </div>
        <div>
          <label class="block text-xs text-[#a8a29e] mb-1.5">触发位置 X (px)</label>
          <input v-model.number="(action as ScrollAction).targetX" type="number" placeholder="默认光标处" class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-cyan-500" />
        </div>
        <div>
          <label class="block text-xs text-[#a8a29e] mb-1.5">触发位置 Y (px)</label>
          <input v-model.number="(action as ScrollAction).targetY" type="number" placeholder="默认光标处" class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-cyan-500" />
        </div>
      </div>
    </div>

    <!-- 6. 延时等待 (delay) -->
    <div v-else-if="action.type === 'delay'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <label class="block text-xs font-medium text-[#d5cdc4]">暂停等待时间 (秒)</label>
      <input
        v-model.number="(action as DelayAction).seconds"
        type="number"
        step="0.1"
        min="0.1"
        class="w-48 px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
      />
    </div>

    <!-- 7. 输入文本 / 粘贴剪贴板 / 清空并输入 -->
    <div v-else-if="action.type === 'input_text' || action.type === 'clear_and_input' || action.type === 'paste_clipboard'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <label class="block text-xs font-medium text-[#d5cdc4]">
        {{ action.type === 'clear_and_input' ? '清空后输入的文本' : action.type === 'paste_clipboard' ? '粘贴剪贴板 (可自定义文本)' : '键盘输入的文本内容' }}
      </label>
      <textarea
        v-model="(action as InputAction).text"
        rows="2"
        placeholder="请输入待自动输入的文本内容..."
        class="w-full px-3 py-2 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-rose-500 font-mono"
      ></textarea>
    </div>

    <!-- 7.1 发送按键 (send_key) -->
    <div v-else-if="action.type === 'send_key'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-[#d5cdc4]">目标按键 / 组合键</span>
        <button
          type="button"
          @click="toggleKeyCapture"
          :class="[
            'px-2.5 py-1 text-[11px] rounded-md border font-medium transition-colors cursor-pointer flex items-center gap-1.5',
            isCapturingKey
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
              : 'bg-[#191716] border-[#383430] text-[#d5cdc4] hover:border-rose-500/60'
          ]"
        >
          <Keyboard class="w-3.5 h-3.5" />
          {{ isCapturingKey ? '请按下键盘按键 (Esc取消)...' : '键盘录制按键' }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="col-span-2">
          <input
            v-model="(action as SendKeyAction).key"
            type="text"
            placeholder="如 Enter / D / K / Space / Cmd+C"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] placeholder-[#78716c] focus:outline-none focus:border-rose-500 font-mono"
          />
        </div>
        <div class="relative">
          <input
            v-model.number="(action as SendKeyAction).repeat"
            type="number"
            min="1"
            max="50"
            placeholder="1"
            class="w-full px-3 py-1.5 pr-8 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] focus:outline-none focus:border-rose-500 font-mono"
          />
          <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#78716c]">次</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] text-[#78716c] mr-0.5">常用:</span>
        <button
          v-for="preset in keyPresets"
          :key="preset.value"
          type="button"
          @click="(action as SendKeyAction).key = preset.value"
          :class="[
            'px-2 py-0.5 text-[11px] rounded border font-mono transition-colors cursor-pointer',
            (action as SendKeyAction).key === preset.value
              ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
              : 'bg-[#191716] border-[#383430] text-[#a8a29e] hover:text-[#fbfaf8] hover:border-[#524b44]'
          ]"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <!-- 8. 打开应用 / 网址 / 文件 -->
    <div v-else-if="action.type === 'open_app' || action.type === 'open_url' || action.type === 'open_file'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <label class="block text-xs font-medium text-[#d5cdc4]">
        {{ action.type === 'open_app' ? '应用名称 (如 Safari / 微信)' : action.type === 'open_url' ? 'URL 网址链接' : '文件系统绝对路径' }}
      </label>
      <input
        v-model="(action as OpenAction).target"
        type="text"
        class="w-full px-3 py-1.5 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono focus:border-[#da7756]"
      />
    </div>

    <!-- 9. 运行 Shell / AppleScript -->
    <div v-else-if="action.type === 'run_shell' || action.type === 'run_applescript'" class="p-2.5 rounded-lg bg-[#211f1c] border border-[#383430] space-y-2">
      <label class="block text-xs font-medium text-[#d5cdc4]">
        {{ action.type === 'run_shell' ? 'Shell 命令行指令' : 'AppleScript 脚本代码' }}
      </label>
      <textarea
        v-model="(action as RunScriptAction).command"
        rows="3"
        class="w-full px-3 py-2 text-xs rounded-lg bg-[#191716] border border-[#383430] text-[#fbfaf8] font-mono text-[11px]"
      ></textarea>
    </div>

    <!-- 10. 其他动作默认提示 -->
    <div v-else class="p-3.5 rounded-lg bg-[#211f1c] border border-[#383430] text-xs text-[#a8a29e]">
      已选择「{{ actionTitle }}」，自动化引擎将在执行流到达时调度此指令。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import HelpTip from './common/HelpTip.vue';

const clampOcrScale = () => {
  if (props.action.ocrImageScale !== undefined && props.action.ocrImageScale !== null) {
    let val = Number(props.action.ocrImageScale);
    if (isNaN(val)) val = 1.0;
    if (val < 0.5) val = 0.5;
    if (val > 1.0) val = 1.0;
    props.action.ocrImageScale = val;
  }
};

import { Crosshair, ArrowUpRight, Spline, Mouse, Keyboard } from 'lucide-vue-next';
import type {
  ScriptAction,
  ClickPositionAction,
  ClickTextAction,
  ScrollAction,
  InputAction,
  SendKeyAction,
  OpenAction,
  RunScriptAction,
  DelayAction
} from '../types/script';
import { maskStore } from '../stores/maskStore';

const props = defineProps<{
  action: ScriptAction;
}>();

if (!props.action.recognizeMode) {
  props.action.recognizeMode = 'local';
}

const emit = defineEmits<{
  (e: 'pick-point', field: string): void;
}>();

const lineFields = [
  { key: 'startX', label: '起点 X1 (px)', step: undefined },
  { key: 'startY', label: '起点 Y1 (px)', step: undefined },
  { key: 'endX', label: '终点 X2 (px)', step: undefined },
  { key: 'endY', label: '终点 Y2 (px)', step: undefined },
  { key: 'durationSeconds', label: '拖动耗时 (秒)', step: '0.1' }
];

const curveFields = [
  { key: 'startX', label: '起点 X1', class: 'text-[#a8a29e]', inputClass: 'text-[#fbfaf8]', step: undefined },
  { key: 'startY', label: '起点 Y1', class: 'text-[#a8a29e]', inputClass: 'text-[#fbfaf8]', step: undefined },
  { key: 'controlX', label: '拐点 CX', class: 'text-purple-400', inputClass: 'border-purple-700/60 text-purple-200', step: undefined },
  { key: 'controlY', label: '拐点 CY', class: 'text-purple-400', inputClass: 'border-purple-700/60 text-purple-200', step: undefined },
  { key: 'endX', label: '终点 X2', class: 'text-[#a8a29e]', inputClass: 'text-[#fbfaf8]', step: undefined },
  { key: 'endY', label: '终点 Y2', class: 'text-[#a8a29e]', inputClass: 'text-[#fbfaf8]', step: undefined },
  { key: 'durationSeconds', label: '时长 (秒)', class: 'text-[#a8a29e]', inputClass: 'text-[#fbfaf8]', step: '0.1' }
];

const handlePickPoint = async (targetField: string) => {
  await maskStore.startPointPicking({
    actionId: props.action.id,
    targetField,
    actionName: props.action.name
  });
  emit('pick-point', targetField);
};

const actionTitle = computed(() => props.action.name || props.action.type);

const keyPresets = [
  { label: 'Enter', value: 'Enter' },
  { label: 'Esc', value: 'Esc' },
  { label: 'Space', value: 'Space' },
  { label: 'Tab', value: 'Tab' },
  { label: 'Backspace', value: 'Backspace' },
  { label: '↑', value: 'Up' },
  { label: '↓', value: 'Down' },
  { label: '←', value: 'Left' },
  { label: '→', value: 'Right' },
  { label: 'D', value: 'D' },
  { label: 'K', value: 'K' }
];

const isCapturingKey = ref(false);
const mapBrowserKeyToName = (e: KeyboardEvent): string | null => {
  const modOnly = ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock'];
  if (modOnly.includes(e.key)) return null;

  const mods: string[] = [];
  if (e.metaKey) mods.push('Cmd');
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  let base = e.key;
  if (base === ' ') base = 'Space';
  else if (base === 'ArrowUp') base = 'Up';
  else if (base === 'ArrowDown') base = 'Down';
  else if (base === 'ArrowLeft') base = 'Left';
  else if (base === 'ArrowRight') base = 'Right';
  else if (base.length === 1) base = base.toUpperCase();

  return mods.length > 0 ? `${mods.join('+')}+${base}` : base;
};

const onKeyCaptureDown = (e: KeyboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    stopKeyCapture();
    return;
  }
  const captured = mapBrowserKeyToName(e);
  if (captured) {
    (props.action as SendKeyAction).key = captured;
    stopKeyCapture();
  }
};

const stopKeyCapture = () => {
  isCapturingKey.value = false;
  window.removeEventListener('keydown', onKeyCaptureDown, true);
};

const toggleKeyCapture = () => {
  if (isCapturingKey.value) {
    stopKeyCapture();
  } else {
    isCapturingKey.value = true;
    window.addEventListener('keydown', onKeyCaptureDown, true);
  }
};

onUnmounted(stopKeyCapture);
</script>
