<template>
  <div class="h-full flex flex-col bg-[#191716] text-[#fbfaf8] overflow-hidden font-sans">
    <!-- 顶部导航栏 -->
    <header class="px-8 py-5 border-b border-[#383430] bg-[#211f1c]/70 backdrop-blur-md flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <button
          @click="handleBack"
          class="p-2 rounded-xl text-[#a8a29e] hover:text-[#fbfaf8] hover:bg-[#2c2825] border border-[#383430] transition-colors cursor-pointer"
          title="返回"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div>
          <h1 class="text-lg font-bold text-[#fbfaf8] flex items-center gap-2">
            关于 Glimpse 灵眸
          </h1>
          <p class="text-xs text-[#a8a29e] mt-0.5">
            新一代 macOS 原生桌面级自动化脚本工具 · 由 XRSec 团队匠心打造
          </p>
        </div>
      </div>
    </header>

    <!-- 主体内容滚动区 -->
    <div class="flex-1 overflow-y-auto px-8 py-8 space-y-6 max-w-4xl mx-auto w-full">
      <!-- 1. 主视觉品牌展示卡片 (Hero Card) -->
      <section class="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#24211e] via-[#211f1c] to-[#1c1a17] border border-[#383430] p-8 shadow-2xl">
        <!-- 背景暖色光晕装饰 -->
        <div class="absolute -top-24 -right-24 w-72 h-72 bg-[#da7756]/15 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-24 -left-24 w-72 h-72 bg-[#da7756]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          <!-- XRSec Logo 容器 -->
          <div class="relative group shrink-0">
            <div class="w-28 h-28 rounded-3xl p-1 bg-gradient-to-tr from-[#da7756] via-[#e28465] to-amber-400 shadow-2xl shadow-[#da7756]/20 group-hover:scale-105 transition-transform duration-300">
              <img
                src="/xrsec-logo.png"
                alt="XRSec Logo"
                class="w-full h-full object-cover rounded-[22px] bg-[#191716] shadow-inner"
                @error="onLogoError"
              />
            </div>
            <!-- 状态光环 -->
            <div class="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full bg-[#da7756] text-white text-[10px] font-bold shadow-md flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              <span>v1.0</span>
            </div>
          </div>

          <!-- 核心介绍 -->
          <div class="flex-1 text-center md:text-left space-y-3">
            <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 justify-center md:justify-start">
              <h2 class="text-2xl font-extrabold tracking-tight text-[#fbfaf8]">Glimpse 灵眸</h2>
              <span class="px-2.5 py-0.5 rounded-full bg-[#da7756]/15 border border-[#da7756]/30 text-[#da7756] text-xs font-mono font-medium self-center md:self-auto">
                macOS Native Automation
              </span>
            </div>

            <p class="text-sm text-[#d5cdc4] leading-relaxed max-w-xl">
              Glimpse 灵眸是一款深度对标「自动精灵」的 macOS 原生自动化桌面应用。融合 Apple 视觉 Vision OCR 引擎、原生 CoreGraphics 硬件级键鼠模拟与零延迟透明悬浮蒙版，助您轻松实现高精度、无阻塞的桌面日常自动化流程编排。
            </p>

            <!-- 组织与座右铭 -->
            <div class="pt-2 flex flex-wrap items-center gap-4 justify-center md:justify-start text-xs text-[#a8a29e]">
              <div class="flex items-center gap-1.5 text-[#fbfaf8]">
                <Shield class="w-4 h-4 text-[#da7756]" />
                <span class="font-semibold text-[#fbfaf8]">XRSec</span>
              </div>
              <span class="text-[#78716c]">·</span>
              <span class="italic text-[#d5cdc4] font-serif">“低调求发展，潜心习安全”</span>
            </div>

            <!-- GitHub 快速操作按钮区 -->
            <div class="pt-4 flex flex-wrap items-center gap-3 justify-center md:justify-start">
              <button
                @click="openUrl('https://github.com/XRSec')"
                class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#da7756] hover:bg-[#e28465] text-white text-xs font-semibold shadow-lg shadow-[#da7756]/20 border border-[#da7756]/40 transition-all active:scale-95 cursor-pointer"
              >
                <Github class="w-4 h-4" />
                <span>GitHub @XRSec</span>
                <ExternalLink class="w-3 h-3 text-white/80" />
              </button>

              <button
                @click="openUrl('https://github.com/XRSec/Screen-Remote')"
                class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#262320] hover:bg-[#2c2825] text-[#d5cdc4] hover:text-[#fbfaf8] text-xs font-semibold border border-[#383430] transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles class="w-4 h-4 text-[#da7756]" />
                <span>开源项目主页</span>
                <ExternalLink class="w-3 h-3 text-[#a8a29e]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 软件核心亮点与架构设计 (Feature Matrix) -->
      <section class="space-y-3">
        <h3 class="text-xs font-bold text-[#a8a29e] uppercase tracking-wider px-1">核心技术特色</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 特性 1: Apple Vision OCR -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30">
                <Eye class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">Apple 原生 Vision OCR 引擎</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              基于 Apple 原生 <code class="text-amber-300 font-mono text-[11px]">VNRecognizeTextRequest</code> 离线视觉文字识别，纯本地毫秒级推理，支持精确/模糊文字匹配，零网络依赖，数据隐私 100% 本地留存。
            </p>
          </div>

          <!-- 特性 2: 动态穿透悬浮蒙版 -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30">
                <Layers class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">60FPS 动态穿透悬浮蒙版</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              采用 NSFloatingWindowLevel 原生透明层与 CoreGraphics 物理绝对坐标映射，具备原生平滑拖动与拉框选区，既可框定识别区域，又不阻挡您正常操作底层软件。
            </p>
          </div>

          <!-- 特性 3: 硬件级拟人键鼠模拟 -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <MousePointer2 class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">拟人化真实键鼠模拟</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              直接通过 macOS HID 事件流注入，完美支持左键单击、双击、原生右键、贝塞尔平滑曲线拖动与鼠标滚轮，自动解决非活跃窗口 click-through 吞键难题。
            </p>
          </div>

          <!-- 特性 4: 智能录制与相对偏移 -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                <Crosshair class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">独立识别、基准定位 & 自适应右键</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              支持独立的无操作纯识别步骤与内存热缓存，提供分工明确的基准【定位】（画绿框与搜索矩形不点击）与单步【测试】（真执行），配合自适应右键轻松驾驭复杂动态弹窗。
            </p>
          </div>

          <!-- 特性 5: 专职蒙版管理中心 -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <Sliders class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">专职蒙版管理器 (maskStore)</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              全面收敛位置尺寸、全屏/窗口吸附、显隐穿透仲裁、限制选区与定位矩形状态，提供一致、规范的原子化调用 API，彻底消除跨组件状态无序操作。
            </p>
          </div>

          <!-- 特性 6: 自动化控制中枢 -->
          <div class="p-5 rounded-2xl bg-[#24211e]/90 border border-[#383430] hover:border-[#4d4742] transition-all space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Workflow class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-bold text-[#fbfaf8]">自动化控制系统 (automationController)</h4>
            </div>
            <p class="text-xs text-[#a8a29e] leading-relaxed">
              依据蒙版数据和步骤限制区域动态推导高精度 ROI 截图，调度 Apple Vision OCR、图像模板匹配与色值检索，严格隔离无害定位与真实硬件派发。
            </p>
          </div>
        </div>
      </section>

      <!-- 3. 技术规范与环境 (Environment & Spec) -->
      <section class="p-6 rounded-2xl bg-[#24211e]/60 border border-[#383430] space-y-4">
        <h3 class="text-xs font-bold text-[#d5cdc4] flex items-center gap-2">
          <Cpu class="w-4 h-4 text-[#da7756]" />
          <span>运行环境与系统架构</span>
        </h3>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div class="p-3 rounded-xl bg-[#191716] border border-[#383430]">
            <div class="text-[#78716c] text-[11px] mb-1">操作系统</div>
            <div class="text-[#fbfaf8] font-semibold">macOS 11.0 - 15+</div>
          </div>
          <div class="p-3 rounded-xl bg-[#191716] border border-[#383430]">
            <div class="text-[#78716c] text-[11px] mb-1">CPU 芯片架构</div>
            <div class="text-[#fbfaf8] font-semibold">Apple / Intel 双架构</div>
          </div>
          <div class="p-3 rounded-xl bg-[#191716] border border-[#383430]">
            <div class="text-[#78716c] text-[11px] mb-1">底层运行框架</div>
            <div class="text-[#fbfaf8] font-semibold">Tauri 2.0 (Rust)</div>
          </div>
          <div class="p-3 rounded-xl bg-[#191716] border border-[#383430]">
            <div class="text-[#78716c] text-[11px] mb-1">用户界面驱动</div>
            <div class="text-[#fbfaf8] font-semibold">Vue 3 + Tailwind CSS</div>
          </div>
        </div>
      </section>

      <!-- 4. 底部版权与免责声明 -->
      <footer class="pt-4 pb-6 text-center space-y-2 text-xs text-[#78716c] select-none">
        <div class="flex items-center justify-center gap-1.5 text-[#a8a29e]">
          <span>Crafted with</span>
          <Heart class="w-3.5 h-3.5 text-[#da7756] fill-[#da7756]" />
          <span>by</span>
          <a
            href="https://github.com/XRSec"
            target="_blank"
            @click.prevent="openUrl('https://github.com/XRSec')"
            class="text-[#da7756] hover:text-[#e28465] font-semibold underline decoration-[#da7756]/40 cursor-pointer"
          >
            XRSec
          </a>
        </div>
        <p>Copyright © 2026 XRSec. All rights reserved.</p>
        <p class="text-[11px] text-[#78716c]">
          本软件仅供个人生产力提升与自动化辅助使用，请遵循所在操作系统及目标应用的用户协议与安全规范。
        </p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Shield,
  Sparkles,
  ExternalLink,
  Github,
  Eye,
  Layers,
  MousePointer2,
  Crosshair,
  Cpu,
  Heart,
  Sliders,
  Workflow
} from 'lucide-vue-next';
import { scriptStore, openExternalUrl } from '../stores/scriptStore';

const handleBack = () => {
  scriptStore.currentView.value = 'list';
};

const openUrl = (url: string) => {
  openExternalUrl(url);
};

const onLogoError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (target) {
    target.src = 'https://avatars.githubusercontent.com/u/104938249?v=4';
  }
};
</script>
