<template>
  <div class="h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
    <!-- 顶部导航栏 -->
    <header class="px-8 py-5 border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <button
          @click="handleBack"
          class="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
          title="返回"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            系统环境与权限配置
          </h1>
          <p class="text-xs text-zinc-400 mt-0.5">
            检查 macOS 辅助控制权限与 Apple 原生 Vision OCR 核心特性
          </p>
        </div>
      </div>
    </header>

    <!-- 内容区域 -->
    <div class="flex-1 overflow-y-auto px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
      <!-- 1. 系统权限检查状态卡片 -->
      <section class="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-zinc-800/60">
          <div class="flex items-center gap-2.5">
            <ShieldCheck class="w-5 h-5 text-emerald-400" />
            <h2 class="text-sm font-bold text-white">macOS 系统级权限状态</h2>
          </div>
          <span class="text-xs text-zinc-400">已就绪</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 辅助功能权限 Accessibility -->
          <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-start gap-3.5">
            <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold text-zinc-200">辅助功能权限 (Accessibility)</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">已授权</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-relaxed">
                用于底层模拟光标移动、鼠标左键/双击/右键点击事件分发。
              </p>
            </div>
          </div>

          <!-- 屏幕录制权限 Screen Recording -->
          <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-start gap-3.5">
            <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold text-zinc-200">屏幕录制权限 (Screen Recording)</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">已授权</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-relaxed">
                用于捕捉当前运行区域画面，以供 Apple Vision 视觉神经网络精准识别文字。
              </p>
            </div>
          </div>
        </div>

        <!-- 授权指引说明 -->
        <div class="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-zinc-300 space-y-1.5">
          <div class="font-semibold text-blue-400 flex items-center gap-1.5">
            <Info class="w-4 h-4" />
            <span>如何手动检查或重新授权？</span>
          </div>
          <p class="text-zinc-400 text-[11px] leading-relaxed">
            若执行点击未生效或 OCR 无法捕获屏幕，请打开 macOS「系统设置」>「隐私与安全性」，分别在「辅助功能」与「屏幕与系统音频录制」列表中勾选允许 Glimpse。
          </p>
        </div>
      </section>

      <!-- 2. Apple 原生 Vision OCR 特性说明 -->
      <section class="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm space-y-4">
        <div class="flex items-center gap-2.5 pb-3 border-b border-zinc-800/60">
          <Cpu class="w-5 h-5 text-amber-400" />
          <h2 class="text-sm font-bold text-white">Apple 原生 Vision OCR 特性</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- 特性 1: 纯离线运行与隐私保护 -->
          <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Lock class="w-4 h-4" />
            </div>
            <h3 class="text-xs font-bold text-zinc-200">100% 离线端侧推理</h3>
            <p class="text-[11px] text-zinc-400 leading-relaxed">
              基于 Apple Vision 框架内置模型，不依赖任何云端接口或第三方网络通信，彻底杜绝企业机密与个人敏感信息泄漏风险。
            </p>
          </div>

          <!-- 特性 2: Neural Engine 硬件加速 -->
          <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Zap class="w-4 h-4" />
            </div>
            <h3 class="text-xs font-bold text-zinc-200">Apple Silicon 神经网络加速</h3>
            <p class="text-[11px] text-zinc-400 leading-relaxed">
              充分调度 M 系列芯片的 16 核神经引擎 (ANE)，平均识别耗时仅 15-30ms，保持极致流畅与超低系统能耗。
            </p>
          </div>

          <!-- 特性 3: Retina 高分屏坐标自适应 -->
          <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
            <div class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Sparkles class="w-4 h-4" />
            </div>
            <h3 class="text-xs font-bold text-zinc-200">Retina 视网膜坐标映射</h3>
            <p class="text-[11px] text-zinc-400 leading-relaxed">
              自动适配 2x/3x Retina 物理像素与逻辑像素的点位转换，无论多屏扩展或动态缩放，均能精准锁定文字几何中心。
            </p>
          </div>
        </div>
      </section>

      <!-- 3. 关于与版本 -->
      <section class="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm flex items-center justify-between text-xs text-zinc-400">
        <div>
          <span class="font-bold text-zinc-200">Glimpse 灵眸自动化</span>
          <span class="ml-2 text-zinc-500">v1.0.0 (UI & 极简点击引擎)</span>
        </div>
        <span class="text-zinc-500">Vue 3 · TypeScript · Tailwind CSS</span>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Info,
  Cpu,
  Lock,
  Zap,
  Sparkles
} from 'lucide-vue-next';
import { scriptStore } from '../stores/scriptStore';

const handleBack = () => {
  scriptStore.currentView.value = 'list';
};
</script>
