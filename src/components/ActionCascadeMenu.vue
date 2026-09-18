<template>
  <div class="relative inline-block text-left select-none" ref="menuContainerRef">
    <!-- 触发插槽或默认按钮 -->
    <div @click="toggleOpen">
      <slot name="trigger">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191716] hover:bg-[#2c2825] border border-[#383430] text-[#fbfaf8] text-xs font-medium shadow-sm transition-all hover:border-[#da7756] active:scale-95 cursor-pointer"
        >
          <component :is="currentActionMeta.icon" class="w-3.5 h-3.5 text-[#da7756]" />
          <span>{{ currentActionMeta.label }}</span>
          <ChevronDown
            class="w-3.5 h-3.5 text-[#a8a29e] transition-transform duration-200"
            :class="{ 'rotate-180': isOpen }"
          />
        </button>
      </slot>
    </div>

    <!-- ================= 核心二级级联弹出菜单 ================= -->
    <div
      v-if="isOpen"
      class="absolute z-50 mt-2 flex rounded-2xl bg-[#24211e]/98 border border-[#383430] shadow-2xl backdrop-blur-2xl overflow-hidden font-sans animate-in fade-in zoom-in-95 duration-150"
      :class="placementClasses"
      @click.stop
    >
      <!-- 左侧：主菜单列表（竖向，深色背景，带向右小箭头 >） -->
      <div class="w-36 py-2 border-r border-[#383430] bg-[#1c1a17]/80 flex flex-col shrink-0">
        <div class="px-3 pb-1.5 mb-1 border-b border-[#383430] text-[10px] font-semibold text-[#78716c] uppercase tracking-wider">
          动作大类
        </div>
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="group relative flex items-center justify-between px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150"
          :class="[
            activeCategory === cat.id
              ? 'bg-[#da7756] text-white shadow-sm'
              : 'text-[#d5cdc4] hover:bg-[#2c2825] hover:text-[#fbfaf8]'
          ]"
          @mouseenter="onCategoryHover(cat.id)"
          @click="onCategoryClick(cat.id)"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <component
              :is="cat.icon"
              class="w-3.5 h-3.5 shrink-0"
              :class="activeCategory === cat.id ? 'text-white' : 'text-[#a8a29e] group-hover:text-[#da7756]'"
            />
            <span class="truncate">{{ cat.name }}</span>
          </div>

          <!-- 向右小箭头 > -->
          <ChevronRight
            class="w-3.5 h-3.5 shrink-0 transition-transform"
            :class="[
              activeCategory === cat.id
                ? 'text-white translate-x-0.5'
                : 'text-[#78716c] group-hover:text-[#d5cdc4]'
            ]"
          />
        </div>
      </div>

      <!-- 右侧：二级子菜单（鼠标悬停或点击主菜单项时在右侧展现） -->
      <div class="w-64 py-2 bg-[#24211e]/95 flex flex-col shrink-0 h-[310px]">
        <div class="px-3.5 pb-1.5 mb-1 border-b border-[#383430] flex items-center justify-between text-[10px] text-[#78716c]">
          <span class="font-semibold text-[#a8a29e]">选择具体动作</span>
          <span>{{ currentSubItems.length }} 个可用项</span>
        </div>

        <div class="flex-1 overflow-y-auto px-1.5 space-y-1">
          <div
            v-for="item in currentSubItems"
            :key="item.type"
            class="group px-2.5 py-2 rounded-xl cursor-pointer flex items-start gap-2.5 transition-all duration-150"
            :class="[
              modelValue === item.type
                ? 'bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30'
                : 'hover:bg-[#2c2825] text-[#d5cdc4] border border-transparent'
            ]"
            @click="handleSelect(item.type)"
          >
            <div
              class="p-1.5 rounded-lg shrink-0 mt-0.5"
              :class="[
                modelValue === item.type
                  ? 'bg-[#da7756]/20 text-[#da7756]'
                  : 'bg-[#191716] text-[#a8a29e] group-hover:text-[#da7756] group-hover:bg-[#2c2825]'
              ]"
            >
              <component :is="item.icon" class="w-3.5 h-3.5" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold text-[#fbfaf8] group-hover:text-[#fbfaf8] truncate">
                  {{ item.label }}
                </span>
                <span
                  v-if="item.badge"
                  class="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-300 font-normal shrink-0 border border-amber-500/30"
                >
                  {{ item.badge }}
                </span>
              </div>
              <p v-if="item.subLabel" class="text-[11px] text-[#a8a29e] group-hover:text-[#d5cdc4] truncate mt-0.5">
                {{ item.subLabel }}
              </p>
            </div>

            <Check
              v-if="modelValue === item.type"
              class="w-4 h-4 text-[#da7756] shrink-0 self-center"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  Check,
  MousePointerClick,
  Move,
  Keyboard,
  ExternalLink,
  Terminal,
  Monitor,
  SlidersHorizontal,
  Crosshair,
  Image as ImageIcon,
  Type,
  Palette,
  Boxes,
  ScanSearch,
  ArrowUpRight,
  Spline,
  Mouse,
  PenTool,
  Clipboard,
  Eraser,
  AppWindow,
  Globe,
  FileText,
  Code2,
  Eye,
  EyeOff,
  Camera,
  Clock,
  GitBranch
} from 'lucide-vue-next';
import type { ActionType, ActionCategory } from '../types/script';

const props = withDefaults(
  defineProps<{
    modelValue?: ActionType;
    placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  }>(),
  {
    modelValue: 'click_position',
    placement: 'bottom-left'
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: ActionType): void;
  (e: 'select', val: ActionType): void;
}>();

const isOpen = ref(false);
const activeCategory = ref<ActionCategory>('click');
const menuContainerRef = ref<HTMLElement | null>(null);

// 弹出位置样式
const placementClasses = computed(() => {
  switch (props.placement) {
    case 'bottom-right':
      return 'right-0 top-full';
    case 'top-left':
      return 'left-0 bottom-full mb-2';
    case 'top-right':
      return 'right-0 bottom-full mb-2';
    case 'bottom-left':
    default:
      return 'left-0 top-full';
  }
});

// 完整的二级菜单定义（严格对应用户要求与截图）
const categories = [
  {
    id: 'click' as ActionCategory,
    name: '点击',
    icon: MousePointerClick,
    children: [
      {
        type: 'click_position' as ActionType,
        label: '点击坐标',
        subLabel: '指定桌面或屏幕绝对像素坐标',
        icon: Crosshair
      },
      {
        type: 'click_image' as ActionType,
        label: '点击图片',
        subLabel: '图像模板匹配相似度定位',
        icon: ImageIcon
      },
      {
        type: 'click_text' as ActionType,
        label: '点击文字',
        subLabel: 'Apple 原生 Vision OCR 离线识别',
        badge: 'OCR',
        icon: Type
      },
      {
        type: 'click_color' as ActionType,
        label: '点击颜色',
        subLabel: '特定 HEX 色值容差查找',
        icon: Palette
      },
      {
        type: 'click_node' as ActionType,
        label: '点击节点',
        subLabel: 'macOS 原生 Accessibility 节点',
        icon: Boxes
      }
    ]
  },
  {
    id: 'drag' as ActionCategory,
    name: '拖动',
    icon: Move,
    children: [
      {
        type: 'drag_line' as ActionType,
        label: '拖动直线',
        subLabel: '从起点拖到终点直线轨迹',
        icon: ArrowUpRight
      },
      {
        type: 'drag_curve' as ActionType,
        label: '拖动曲线',
        subLabel: '沿贝塞尔/平滑拟人轨迹拖动',
        icon: Spline
      },
      {
        type: 'scroll' as ActionType,
        label: '滚动',
        subLabel: '鼠标滚轮滚动：上滚、下滚、指定距离',
        icon: Mouse
      }
    ]
  },
  {
    id: 'input' as ActionCategory,
    name: '输入',
    icon: Keyboard,
    children: [
      {
        type: 'input_text' as ActionType,
        label: '输入文本',
        subLabel: '模拟键盘逐字输入文本',
        icon: PenTool
      },
      {
        type: 'paste_clipboard' as ActionType,
        label: '粘贴剪贴板',
        subLabel: '快速粘贴系统剪贴板内容',
        icon: Clipboard
      },
      {
        type: 'clear_and_input' as ActionType,
        label: '清空并输入',
        subLabel: '先全选删除原内容再输入',
        icon: Eraser
      }
    ]
  },
  {
    id: 'open' as ActionCategory,
    name: '打开',
    icon: ExternalLink,
    children: [
      {
        type: 'open_app' as ActionType,
        label: '打开应用',
        subLabel: '根据应用名启动或唤起前台',
        icon: AppWindow
      },
      {
        type: 'open_url' as ActionType,
        label: '打开网址',
        subLabel: '在默认浏览器中打开指定链接',
        icon: Globe
      },
      {
        type: 'open_file' as ActionType,
        label: '打开文件',
        subLabel: '在系统默认关联应用中打开',
        icon: FileText
      }
    ]
  },
  {
    id: 'run' as ActionCategory,
    name: '运行',
    icon: Terminal,
    children: [
      {
        type: 'run_shell' as ActionType,
        label: '运行 Shell 脚本',
        subLabel: '执行 bash / zsh 命令行终端脚本',
        icon: Terminal
      },
      {
        type: 'run_applescript' as ActionType,
        label: '运行 AppleScript',
        subLabel: '调用 macOS 原生自动化脚本指令',
        icon: Code2
      }
    ]
  },
  {
    id: 'ui' as ActionCategory,
    name: '界面',
    icon: Monitor,
    children: [
      {
        type: 'wait_text_appear' as ActionType,
        label: '等待文字出现',
        subLabel: '持续检索直至屏幕出现目标文字',
        icon: Eye
      },
      {
        type: 'wait_text_disappear' as ActionType,
        label: '等待文字消失',
        subLabel: '持续监控直至文字从屏幕消失',
        icon: EyeOff
      },
      {
        type: 'save_screenshot' as ActionType,
        label: '截图保存',
        subLabel: '保存当前选框或全屏快照至磁盘',
        icon: Camera
      }
    ]
  },
  {
    id: 'identify' as ActionCategory,
    name: '识别',
    icon: ScanSearch,
    children: [
      {
        type: 'identify_text' as ActionType,
        label: '识别文字',
        subLabel: 'Apple 原生 Vision OCR 定位文字，不点击',
        badge: 'OCR',
        icon: Type
      },
      {
        type: 'identify_image' as ActionType,
        label: '识别图片',
        subLabel: '图像模板匹配相似度定位，不点击',
        icon: ImageIcon
      },
      {
        type: 'identify_color' as ActionType,
        label: '识别颜色',
        subLabel: '特定 HEX 色值容差查找，不点击',
        icon: Palette
      },
      {
        type: 'identify_node' as ActionType,
        label: '识别节点',
        subLabel: 'macOS 原生 Accessibility 节点定位，不点击',
        icon: Boxes
      }
    ]
  },
  {
    id: 'advanced' as ActionCategory,
    name: '高级',
    icon: SlidersHorizontal,
    children: [
      {
        type: 'delay' as ActionType,
        label: '延时等待',
        subLabel: '固定暂停指定秒数',
        icon: Clock
      },
      {
        type: 'condition' as ActionType,
        label: '条件判断',
        subLabel: '根据界面状态分支跳转或中断',
        icon: GitBranch
      }
    ]
  }
];

// 当前分类的二级子菜单项
const currentSubItems = computed(() => {
  const cat = categories.find(c => c.id === activeCategory.value);
  return cat ? cat.children : [];
});

// 根据当前的 modelValue 获取元数据，用于默认展示按钮
const currentActionMeta = computed(() => {
  for (const cat of categories) {
    for (const item of cat.children) {
      if (item.type === props.modelValue) {
        return {
          label: item.label,
          categoryName: cat.name,
          icon: item.icon
        };
      }
    }
  }
  return {
    label: '点击坐标',
    categoryName: '点击',
    icon: Crosshair
  };
});

// 当打开菜单时，自动将 activeCategory 设为当前选中动作所属的大类
const syncActiveCategoryFromModel = () => {
  for (const cat of categories) {
    if (cat.children.some(c => c.type === props.modelValue)) {
      activeCategory.value = cat.id;
      return;
    }
  }
};

const toggleOpen = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    syncActiveCategoryFromModel();
  }
};

const onCategoryHover = (catId: ActionCategory) => {
  activeCategory.value = catId;
};

const onCategoryClick = (catId: ActionCategory) => {
  activeCategory.value = catId;
};

const handleSelect = (type: ActionType) => {
  emit('update:modelValue', type);
  emit('select', type);
  isOpen.value = false;
};

// 点击外部关闭
const handleClickOutside = (e: MouseEvent) => {
  if (menuContainerRef.value && !menuContainerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

// ESC 键关闭
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false;
  }
};

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeyDown);
});
</script>
