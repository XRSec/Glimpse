<template>
  <div
    class="rounded-xl border transition-all duration-200 overflow-hidden"
    :class="[
      action.isEnabled
        ? 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
        : 'bg-zinc-950/40 border-zinc-900 opacity-60',
      isCurrentRunning ? 'ring-2 ring-blue-500 border-blue-500/80 shadow-lg shadow-blue-500/10' : ''
    ]"
  >
    <!-- ================= 卡片头部栏 (点击空白处展开/折叠) ================= -->
    <div
      class="px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-zinc-800/40"
      @click="toggleExpand"
    >
      <!-- 左侧：序号 + 类型图标 + 名称 + 摘要 -->
      <div class="flex items-center gap-3 min-w-0 flex-1 mr-3">
        <!-- 序号圆标 -->
        <span
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
          :class="[
            isCurrentRunning
              ? 'bg-blue-500 text-white animate-pulse'
              : action.isEnabled
              ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              : 'bg-zinc-900 text-zinc-600 border border-zinc-800'
          ]"
        >
          {{ index + 1 }}
        </span>

        <!-- 类型图标 -->
        <div
          class="p-1.5 rounded-lg shrink-0"
          :class="getActionIconBadgeClass(action.type)"
        >
          <component :is="getActionIcon(action.type)" class="w-4 h-4" />
        </div>

        <!-- 动作名称与摘要 -->
        <div class="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-zinc-200 truncate">
              {{ action.name || getActionDefaultTitle(action.type) }}
            </span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-normal shrink-0 border border-zinc-700/50">
              {{ getActionCategoryLabel(action.type) }}
            </span>

            <!-- 对标截图 1: 标题栏/头部显示：“本地识别 限制区域” -->
            <span
              v-if="isRecognitionAction"
              class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300 font-medium shrink-0 flex items-center gap-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              <span>本地识别 限制区域</span>
            </span>
          </div>

          <!-- 收起时显示的摘要 -->
          <span
            v-if="!action.isExpanded"
            class="text-xs text-zinc-500 truncate flex items-center gap-1.5"
          >
            <!-- 点击文字摘要 -->
            <template v-if="action.type === 'click_text'">
              <span class="text-amber-300/90 font-mono">“{{ (action as ClickTextAction).targetText || '未填文字' }}”</span>
              <span class="text-zinc-600">·</span>
              <span>{{ getButtonLabel((action as ClickTextAction).button) }}</span>
            </template>

            <!-- 点击坐标摘要 -->
            <template v-else-if="action.type === 'click_position'">
              <span class="text-blue-300/90 font-mono">({{ (action as ClickPositionAction).x }}, {{ (action as ClickPositionAction).y }})</span>
              <span class="text-zinc-600">·</span>
              <span>{{ getButtonLabel((action as ClickPositionAction).button) }}</span>
            </template>

            <!-- 拖动直线摘要 -->
            <template v-else-if="action.type === 'drag_line'">
              <span class="text-emerald-300/90 font-mono">
                ({{ (action as DragLineAction).startX }}, {{ (action as DragLineAction).startY }}) → ({{ (action as DragLineAction).endX }}, {{ (action as DragLineAction).endY }})
              </span>
              <span class="text-zinc-600">·</span>
              <span>{{ (action as DragLineAction).durationSeconds }}s</span>
            </template>

            <!-- 拖动曲线摘要 -->
            <template v-else-if="action.type === 'drag_curve'">
              <span class="text-purple-300/90 font-mono">
                贝塞尔 ({{ (action as DragCurveAction).startX }}, {{ (action as DragCurveAction).startY }}) → ({{ (action as DragCurveAction).endX }}, {{ (action as DragCurveAction).endY }})
              </span>
            </template>

            <!-- 滚动摘要 -->
            <template v-else-if="action.type === 'scroll'">
              <span class="text-cyan-300/90">
                滚轮{{ (action as ScrollAction).direction === 'up' ? '向上' : '向下' }} {{ (action as ScrollAction).distance }} 步
              </span>
            </template>

            <!-- 输入文本摘要 -->
            <template v-else-if="action.type === 'input_text' || action.type === 'clear_and_input'">
              <span class="text-rose-300/90 font-mono truncate max-w-[120px]">
                “{{ (action as InputAction).text || '' }}”
              </span>
            </template>

            <!-- 延时摘要 -->
            <template v-else-if="action.type === 'delay'">
              <span class="text-zinc-300">延时 {{ (action as DelayAction).seconds }}s</span>
            </template>

            <span v-if="action.customWaitSeconds != null" class="text-zinc-500 ml-1">
              [等 {{ action.customWaitSeconds }}s]
            </span>

            <!-- 区域限制标识徽标 -->
            <span
              v-if="action.regionScope && getRegionScopeBadge(action.regionScope)"
              class="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-700/50 text-cyan-300 font-medium shrink-0"
            >
              {{ getRegionScopeBadge(action.regionScope) }}
            </span>
          </span>
        </div>
      </div>

      <!-- 右侧控制区：启用开关 + 排序 + 删除 + 展开折叠箭头 -->
      <div class="flex items-center gap-2 shrink-0" @click.stop>
        <!-- 启用开关 Toggle -->
        <button
          type="button"
          @click="toggleEnabled"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
          :class="action.isEnabled ? 'bg-blue-600' : 'bg-zinc-800'"
          title="启用/禁用当前动作"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
            :class="action.isEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>

        <!-- 上移按钮 -->
        <button
          type="button"
          @click="$emit('move-up')"
          :disabled="isFirst"
          class="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          title="上移"
        >
          <ChevronUp class="w-4 h-4" />
        </button>

        <!-- 下移按钮 -->
        <button
          type="button"
          @click="$emit('move-down')"
          :disabled="isLast"
          class="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          title="下移"
        >
          <ChevronDown class="w-4 h-4" />
        </button>

        <!-- 删除按钮 -->
        <button
          type="button"
          @click="$emit('delete')"
          class="p-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="删除此动作"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <!-- 展开折叠箭头指示 -->
        <div class="p-1 text-zinc-500">
          <ChevronDown
            class="w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-180': action.isExpanded }"
          />
        </div>
      </div>
    </div>

    <!-- ================= 展开后的详细参数配置 ================= -->
    <div
      v-if="action.isExpanded"
      class="px-5 py-4 border-t border-zinc-800/80 bg-zinc-950/40 space-y-4"
    >
      <!-- 1. 动作基础命名与二级级联动作类型切换 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <!-- 动作名称 -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1.5">动作说明 / 自定义名称</label>
          <input
            v-model="action.name"
            type="text"
            :placeholder="`例如：${getActionDefaultTitle(action.type)}`"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <!-- 动作类型切换 -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1.5">
            动作分类类型 <span class="text-zinc-500 text-[11px]">(点击唤起完整动作库)</span>
          </label>
          <ActionCascadeMenu
            :model-value="action.type"
            @select="changeActionType"
          />
        </div>
      </div>

      <!-- ================= 核心对标截图 1：本地识别 限制区域 属性配置块 ================= -->
      <div
        v-if="isRecognitionAction"
        class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/90 shadow-sm space-y-3.5"
      >
        <!-- 头部小标题：本地识别 限制区域 -->
        <div class="flex items-center justify-between pb-2 border-b border-zinc-800/70">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
              <Scan class="w-3.5 h-3.5 text-blue-400" />
              本地识别 限制区域
            </span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
              精确范围查找
            </span>
          </div>
          <span class="text-[11px] text-zinc-500">
            限制查找文字或目标的屏幕区域范围，大幅提升识别速度
          </span>
        </div>

        <!-- 属性行 1: 位置类型 下拉框 ▾ 带 ? 图标 -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div class="w-24 shrink-0 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <span>位置类型</span>
            <button
              type="button"
              class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="选择定位目标的方式：文字(OCR识别)、固定坐标、图像匹配等"
            >
              <HelpCircle class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex-1 max-w-xs">
            <select
              :value="action.type"
              @change="changeActionType(($event.target as HTMLSelectElement).value as ActionType)"
              class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="click_text">文字 ▾</option>
              <option value="click_position">坐标 ▾</option>
              <option value="click_image">图片 ▾</option>
              <option value="click_color">颜色 ▾</option>
              <option value="click_node">节点 ▾</option>
              <option value="ai_click">AI点击 ▾</option>
            </select>
          </div>
        </div>

        <!-- 属性行 2: 当位置类型为文字时：文字 输入框 (如 确定) 带 ? 图标 -->
        <div v-if="action.type === 'click_text'" class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div class="w-24 shrink-0 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <span>文字</span>
            <button
              type="button"
              class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="输入屏幕限制区域内要识别匹配的目标文字"
            >
              <HelpCircle class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex-1 flex items-center gap-3">
            <input
              v-model="(action as ClickTextAction).targetText"
              type="text"
              placeholder="确定"
              class="w-full max-w-md px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
            />
            <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer whitespace-nowrap">
              <input
                v-model="(action as ClickTextAction).fuzzyMatch"
                type="checkbox"
                class="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-blue-500"
              />
              <span>模糊匹配</span>
            </label>
          </div>
        </div>

        <!-- 当位置类型为坐标时：坐标快速设置与拾取 -->
        <div v-else-if="action.type === 'click_position'" class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div class="w-24 shrink-0 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <span>坐标点</span>
            <button
              type="button"
              class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="设置要点击的具体屏幕坐标 X 和 Y (像素)"
            >
              <HelpCircle class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex-1 flex items-center gap-3 flex-wrap">
            <div class="relative w-28">
              <input
                v-model.number="(action as ClickPositionAction).x"
                type="number"
                placeholder="500"
                class="w-full pl-3 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
              />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">px</span>
            </div>
            <div class="relative w-28">
              <input
                v-model.number="(action as ClickPositionAction).y"
                type="number"
                placeholder="300"
                class="w-full pl-3 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
              />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">px</span>
            </div>
            <button
              type="button"
              @click="pickMaskPoint('x,y')"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-sm shadow-blue-500/10"
              title="在屏幕蒙版上直接点选目标位置回填坐标"
            >
              <Crosshair class="w-3.5 h-3.5 text-blue-400" />
              <span>🎯 拾取位置</span>
            </button>
          </div>
        </div>

        <!-- 属性行 3: 识别模式 下拉框 ▾ 带 ? 图标 -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div class="w-24 shrink-0 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <span>识别模式</span>
            <button
              type="button"
              class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="识别引擎工作模式：本地识别由 Apple 原生 Vision 离线引擎毫秒级识别，绝不泄露隐私"
            >
              <HelpCircle class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex-1 max-w-xs">
            <select
              v-model="actionRecognizeMode"
              class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="local">本地识别 ▾</option>
              <option value="cloud">云端识别 ▾</option>
            </select>
          </div>
        </div>

        <!-- 属性行 4: 限制区域 行 (支持基于谁限制 + px 数值) -->
        <div class="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 pt-1">
          <div class="w-24 shrink-0 flex items-center gap-1.5 text-xs font-medium text-zinc-300 sm:pt-2">
            <span>限制区域</span>
          </div>

          <div class="flex-1 space-y-2">
            <!-- 限制基于基准下拉框 -->
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-zinc-400 whitespace-nowrap">基于基准：</span>
              <select
                v-model="selectedBaseKey"
                class="px-2.5 py-1 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 focus:border-blue-500 cursor-pointer"
              >
                <option value="mask">基于脚本运行蒙版 (默认)</option>
                <option
                  v-for="(pStep, pIdx) in previousSteps"
                  :key="pStep.id"
                  :value="'step_' + pIdx"
                >
                  基于步骤 #{{ pIdx + 1 }}: {{ pStep.name }} 的点击位置
                </option>
              </select>
            </div>

            <!-- 四列并排紧凑输入框：左、右、上、下 (纯数值 px) -->
            <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <!-- 左 -->
              <div class="w-24">
                <div class="text-[11px] text-zinc-400 text-center mb-1">左 (px)</div>
                <div class="relative">
                  <input
                    v-model.number="limitLeft"
                    type="number"
                    placeholder="0"
                    class="w-full pl-2 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 text-center focus:border-blue-500 font-mono"
                  />
                  <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 select-none">px</span>
                </div>
              </div>

              <!-- 右 -->
              <div class="w-24">
                <div class="text-[11px] text-zinc-400 text-center mb-1">右 (px)</div>
                <div class="relative">
                  <input
                    v-model.number="limitRight"
                    type="number"
                    placeholder="200"
                    class="w-full pl-2 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 text-center focus:border-blue-500 font-mono"
                  />
                  <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 select-none">px</span>
                </div>
              </div>

              <!-- 上 -->
              <div class="w-24">
                <div class="text-[11px] text-zinc-400 text-center mb-1">上 (px)</div>
                <div class="relative">
                  <input
                    v-model.number="limitTop"
                    type="number"
                    placeholder="0"
                    class="w-full pl-2 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 text-center focus:border-blue-500 font-mono"
                  />
                  <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 select-none">px</span>
                </div>
              </div>

              <!-- 下 -->
              <div class="w-24">
                <div class="text-[11px] text-zinc-400 text-center mb-1">下 (px)</div>
                <div class="relative">
                  <input
                    v-model.number="limitBottom"
                    type="number"
                    placeholder="300"
                    class="w-full pl-2 pr-6 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 text-center focus:border-blue-500 font-mono"
                  />
                  <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 select-none">px</span>
                </div>
              </div>

              <!-- 紧跟右侧排列 3 个图标按钮 -->
              <div class="flex items-center gap-1.5 sm:pt-4">
                <!-- 1. [ 🔲 选框图标 ]：点击直接在蒙版拉选区 -->
                <button
                  type="button"
                  @click="startSelectLimitRegion"
                  class="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border border-blue-500/40 hover:border-blue-400 transition-all active:scale-95 cursor-pointer shadow-sm shadow-blue-500/10"
                  title="在屏幕蒙版中拉拽框选矩形区域"
                >
                  <Crop class="w-4 h-4 text-blue-400" />
                </button>

                <!-- 2. [ ⓧ 清除图标 ]：点击重置清空限制区域 -->
                <button
                  type="button"
                  @click="clearLimitRegion"
                  class="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 border border-zinc-700/80 transition-all active:scale-95 cursor-pointer"
                  title="清空重置限制区域"
                >
                  <XCircle class="w-4 h-4" />
                </button>

                <!-- 3. [ ? 提示图标 ] -->
                <button
                  type="button"
                  class="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  :title="limitDescriptionText"
                >
                  <HelpCircle class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- 说明小字 -->
            <div class="text-[11px] text-zinc-500 pt-0.5">
              {{ limitDescriptionText }}
            </div>
          </div>
        </div>

        <!-- 额外辅助参数可折叠调节 (偏移量、超时与按键) -->
        <div class="pt-2 border-t border-zinc-800/60 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-[11px] text-zinc-400 mb-1">点击偏移 X (px)</label>
            <input
              v-if="action.type === 'click_text'"
              v-model.number="(action as ClickTextAction).offsetX"
              type="number"
              placeholder="0"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
            />
            <input
              v-else
              disabled
              placeholder="--"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950/40 border border-zinc-800 text-zinc-600 font-mono"
            />
          </div>
          <div>
            <label class="block text-[11px] text-zinc-400 mb-1">点击偏移 Y (px)</label>
            <input
              v-if="action.type === 'click_text'"
              v-model.number="(action as ClickTextAction).offsetY"
              type="number"
              placeholder="0"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
            />
            <input
              v-else
              disabled
              placeholder="--"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950/40 border border-zinc-800 text-zinc-600 font-mono"
            />
          </div>
          <div>
            <label class="block text-[11px] text-zinc-400 mb-1">查找超时 (秒)</label>
            <input
              v-if="action.type === 'click_text'"
              v-model.number="(action as ClickTextAction).timeoutSeconds"
              type="number"
              placeholder="5"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
            />
            <input
              v-else
              disabled
              placeholder="--"
              class="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-950/40 border border-zinc-800 text-zinc-600 font-mono"
            />
          </div>
          <div>
            <label class="block text-[11px] text-zinc-400 mb-1">触发按键</label>
            <select
              v-if="action.type === 'click_text' || action.type === 'click_position'"
              v-model="(action as any).button"
              class="w-full px-2 py-1 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 focus:border-blue-500"
            >
              <option value="left">左键单击</option>
              <option value="double">左键双击</option>
              <option value="right">右键单击</option>
            </select>
            <div v-else class="text-xs text-zinc-600 pt-1">左键单击</div>
          </div>
        </div>
      </div>

      <!-- ================= 2. 非屏幕识别/其他专用动作参数表单 ================= -->
      <div v-else class="space-y-4">
        <!-- 2.1 【拖动直线】专属参数 -->
        <div v-if="action.type === 'drag_line'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3.5">
          <div class="flex items-center justify-between pb-1 border-b border-zinc-800/60">
            <span class="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <ArrowUpRight class="w-3.5 h-3.5 text-emerald-400" />
              拖动直线轨迹参数 (从起点拖到终点直线)
            </span>

            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="pickMaskPoint('startX,startY')"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Crosshair class="w-3 h-3" />
                <span>🎯 拾取起点</span>
              </button>
              <button
                type="button"
                @click="pickMaskPoint('endX,endY')"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Crosshair class="w-3 h-3" />
                <span>🎯 拾取终点</span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">起点 X1 (px)</label>
              <input
                v-model.number="(action as DragLineAction).startX"
                type="number"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-emerald-500"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">起点 Y1 (px)</label>
              <input
                v-model.number="(action as DragLineAction).startY"
                type="number"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-emerald-500"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">终点 X2 (px)</label>
              <input
                v-model.number="(action as DragLineAction).endX"
                type="number"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-emerald-500"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">终点 Y2 (px)</label>
              <input
                v-model.number="(action as DragLineAction).endY"
                type="number"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-emerald-500"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">拖动耗时 (秒)</label>
              <input
                v-model.number="(action as DragLineAction).durationSeconds"
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        <!-- 2.2 【拖动曲线】专属参数 -->
        <div v-else-if="action.type === 'drag_curve'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3.5">
          <div class="flex items-center justify-between pb-1 border-b border-zinc-800/60">
            <span class="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
              <Spline class="w-3.5 h-3.5 text-purple-400" />
              拖动曲线参数 (起点 → 贝塞尔拐点/控制点 → 终点)
            </span>

            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="pickMaskPoint('startX,startY')"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Crosshair class="w-3 h-3" />
                <span>🎯 拾取起点</span>
              </button>
              <button
                type="button"
                @click="pickMaskPoint('controlX,controlY')"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Crosshair class="w-3 h-3" />
                <span>🎯 拾取拐点</span>
              </button>
              <button
                type="button"
                @click="pickMaskPoint('endX,endY')"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Crosshair class="w-3 h-3" />
                <span>🎯 拾取终点</span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">起点 X1</label>
              <input
                v-model.number="(action as DragCurveAction).startX"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">起点 Y1</label>
              <input
                v-model.number="(action as DragCurveAction).startY"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-purple-400 mb-1">拐点 CX</label>
              <input
                v-model.number="(action as DragCurveAction).controlX"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-purple-700/60 text-purple-200 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-purple-400 mb-1">拐点 CY</label>
              <input
                v-model.number="(action as DragCurveAction).controlY"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-purple-700/60 text-purple-200 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">终点 X2</label>
              <input
                v-model.number="(action as DragCurveAction).endX"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">终点 Y2</label>
              <input
                v-model.number="(action as DragCurveAction).endY"
                type="number"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">时长 (秒)</label>
              <input
                v-model.number="(action as DragCurveAction).durationSeconds"
                type="number"
                step="0.1"
                class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono"
              />
            </div>
          </div>
        </div>

        <!-- 2.3 【鼠标滚动】专属参数 -->
        <div v-else-if="action.type === 'scroll'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3.5">
          <div class="flex items-center justify-between pb-1 border-b border-zinc-800/60">
            <span class="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <Mouse class="w-3.5 h-3.5 text-cyan-400" />
              鼠标滚轮滚动配置
            </span>

            <button
              type="button"
              @click="pickMaskPoint('targetX,targetY')"
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
            >
              <Crosshair class="w-3 h-3" />
              <span>🎯 拾取滚轮位置</span>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1.5">滚动方向</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  @click="(action as ScrollAction).direction = 'up'"
                  class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center"
                  :class="
                    (action as ScrollAction).direction === 'up'
                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  "
                >
                  ▲ 向上
                </button>
                <button
                  type="button"
                  @click="(action as ScrollAction).direction = 'down'"
                  class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center"
                  :class="
                    (action as ScrollAction).direction === 'down'
                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  "
                >
                  ▼ 向下
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1.5">滚动距离 / 步数</label>
              <div class="relative">
                <input
                  v-model.number="(action as ScrollAction).distance"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="5"
                  class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-cyan-500"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">步</span>
              </div>
            </div>

            <div>
              <label class="block text-xs text-zinc-400 mb-1.5">触发位置 X (px)</label>
              <input
                v-model.number="(action as ScrollAction).targetX"
                type="number"
                placeholder="默认光标处"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-cyan-500"
              />
            </div>

            <div>
              <label class="block text-xs text-zinc-400 mb-1.5">触发位置 Y (px)</label>
              <input
                v-model.number="(action as ScrollAction).targetY"
                type="number"
                placeholder="默认光标处"
                class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        <!-- 2.4 【输入文本 / 清空输入】专属参数 -->
        <div v-else-if="action.type === 'input_text' || action.type === 'clear_and_input'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3">
          <label class="block text-xs font-medium text-zinc-300">
            {{ action.type === 'clear_and_input' ? '清空后输入的文本' : '键盘输入的文本内容' }}
          </label>
          <textarea
            v-model="(action as InputAction).text"
            rows="2"
            placeholder="请输入待自动输入的文本内容..."
            class="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 font-mono"
          ></textarea>
        </div>

        <!-- 2.5 【打开应用 / 网址 / 文件】专属参数 -->
        <div v-else-if="action.type === 'open_app' || action.type === 'open_url' || action.type === 'open_file'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3">
          <label class="block text-xs font-medium text-zinc-300">
            {{ action.type === 'open_app' ? '应用名称 (如 Safari / 微信)' : action.type === 'open_url' ? 'URL 网址链接' : '文件系统绝对路径' }}
          </label>
          <input
            v-model="(action as OpenAction).target"
            type="text"
            class="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
          />
        </div>

        <!-- 2.6 【运行 Shell / AppleScript】专属参数 -->
        <div v-else-if="action.type === 'run_shell' || action.type === 'run_applescript'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3">
          <label class="block text-xs font-medium text-zinc-300">
            {{ action.type === 'run_shell' ? 'Shell 命令行指令' : 'AppleScript 脚本代码' }}
          </label>
          <textarea
            v-model="(action as RunScriptAction).command"
            rows="3"
            class="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono text-[11px]"
          ></textarea>
        </div>

        <!-- 2.7 【延时等待】专属参数 -->
        <div v-else-if="action.type === 'delay'" class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3">
          <label class="block text-xs font-medium text-zinc-300">暂停等待时间 (秒)</label>
          <input
            v-model.number="(action as DelayAction).seconds"
            type="number"
            step="0.1"
            min="0.1"
            class="w-48 px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono focus:border-blue-500"
          />
        </div>

        <!-- 2.8 其他动作默认提示 -->
        <div v-else class="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-400">
          已选择「{{ getActionDefaultTitle(action.type) }}」，自动化引擎将在执行流到达时调度此指令。
        </div>
      </div>

      <!-- 4. 单独设置专属等待时间 -->
      <div class="pt-2 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <label class="text-xs text-zinc-400">专属后置等待 (秒):</label>
          <input
            v-model.number="action.customWaitSeconds"
            type="number"
            step="0.1"
            min="0"
            placeholder="留空沿用全局默认"
            class="w-44 px-3 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <span class="text-[11px] text-zinc-500">
          {{ action.customWaitSeconds != null && action.customWaitSeconds !== undefined ? `本步执行后将额外等待 ${action.customWaitSeconds}s` : '当前沿用脚本全局默认等待' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Type,
  Crosshair,
  Trash2,
  Scan,
  Compass,
  Info,
  ArrowUpRight,
  Spline,
  Mouse,
  PenTool,
  ExternalLink,
  Terminal,
  Eye,
  Clock,
  Zap,
  BoxSelect,
  HelpCircle,
  Crop,
  XCircle
} from 'lucide-vue-next';
import ActionCascadeMenu from './ActionCascadeMenu.vue';
import type {
  ScriptAction,
  ClickPositionAction,
  ClickTextAction,
  DragLineAction,
  DragCurveAction,
  ScrollAction,
  InputAction,
  OpenAction,
  RunScriptAction,
  DelayAction,
  ActionType,
  MouseButton,
  RegionScopeType,
  RegionScopeConfig
} from '../types/script';
import {
  scriptStore,
  startMaskPointPicking,
  startMaskROISelection,
  startMaskOffsetMeasurement,
  startMaskLimitSelection,
  createDefaultAction
} from '../stores/scriptStore';

const props = defineProps<{
  action: ScriptAction;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'delete'): void;
}>();

// 确保 regionScope 初始化
if (!props.action.regionScope) {
  props.action.regionScope = {
    baseType: 'mask',
    left: 0,
    right: 200,
    top: 0,
    bottom: 300
  };
}

// 是否为支持屏幕识别或位置定位的动作
const isRecognitionAction = computed(() => {
  return (
    props.action.type.startsWith('click_') ||
    props.action.type === 'ai_click' ||
    props.action.type.startsWith('wait_text')
  );
});

// 识别模式（本地识别 / 云端识别）
const actionRecognizeMode = computed({
  get: () => props.action.recognizeMode || 'local',
  set: (val: string) => {
    props.action.recognizeMode = val as 'local' | 'cloud';
  }
});

// 前序步骤列表 (用于“基于某个步骤的点击位置进行限制”)
const previousSteps = computed(() => {
  return scriptStore.editingScript.value?.actions.slice(0, props.index) || [];
});

// 保证 regionScope 存在
const ensureRegionScope = () => {
  if (!props.action.regionScope) {
    props.action.regionScope = {
      baseType: 'mask',
      left: 0,
      right: 200,
      top: 0,
      bottom: 300
    };
  }
};

// 限制基准下拉绑定
const selectedBaseKey = computed({
  get: () => {
    if (props.action.regionScope?.baseType === 'step') {
      return `step_${props.action.regionScope.targetStepIndex ?? 0}`;
    }
    return 'mask';
  },
  set: (val: string) => {
    ensureRegionScope();
    if (val.startsWith('step_')) {
      const sIdx = parseInt(val.replace('step_', ''), 10);
      props.action.regionScope!.baseType = 'step';
      props.action.regionScope!.targetStepIndex = isNaN(sIdx) ? 0 : sIdx;
    } else {
      props.action.regionScope!.baseType = 'mask';
      props.action.regionScope!.targetStepIndex = undefined;
    }
  }
});

// 动态友好提示文字
const limitDescriptionText = computed(() => {
  if (props.action.regionScope?.baseType === 'step') {
    const sIdx = (props.action.regionScope.targetStepIndex ?? 0) + 1;
    return `以【步骤 #${sIdx}】点击坐标为基准原点，向左 ${props.action.regionScope.left || 0}px、向右 ${props.action.regionScope.right || 200}px、向上 ${props.action.regionScope.top || 0}px、向下 ${props.action.regionScope.bottom || 300}px 框定范围识别（特别适合右键菜单或弹出框检索）`;
  }
  return '以脚本运行蒙版为基准，向内限制在左、右、上、下像素矩形范围识别，大幅提升识别速度';
});

// 限制区域四个值（纯像素数值 px）
const limitLeft = computed<number | string>({
  get: () => props.action.regionScope?.left ?? '',
  set: (val) => {
    ensureRegionScope();
    props.action.regionScope!.left = val === '' || isNaN(Number(val)) ? 0 : Number(val);
  }
});

const limitRight = computed<number | string>({
  get: () => props.action.regionScope?.right ?? '',
  set: (val) => {
    ensureRegionScope();
    props.action.regionScope!.right = val === '' || isNaN(Number(val)) ? 200 : Number(val);
  }
});

const limitTop = computed<number | string>({
  get: () => props.action.regionScope?.top ?? '',
  set: (val) => {
    ensureRegionScope();
    props.action.regionScope!.top = val === '' || isNaN(Number(val)) ? 0 : Number(val);
  }
});

const limitBottom = computed<number | string>({
  get: () => props.action.regionScope?.bottom ?? '',
  set: (val) => {
    ensureRegionScope();
    props.action.regionScope!.bottom = val === '' || isNaN(Number(val)) ? 300 : Number(val);
  }
});

// 清空限制区域
const clearLimitRegion = () => {
  if (props.action.regionScope) {
    props.action.regionScope.left = 0;
    props.action.regionScope.right = 0;
    props.action.regionScope.top = 0;
    props.action.regionScope.bottom = 0;
  }
};

// 唤起屏幕蒙版进行选区
const startSelectLimitRegion = async () => {
  ensureRegionScope();
  await startMaskLimitSelection({
    actionId: props.action.id,
    actionName: props.action.name,
    initialLimit: {
      left: typeof limitLeft.value === 'number' ? limitLeft.value : 0,
      right: typeof limitRight.value === 'number' ? limitRight.value : 200,
      top: typeof limitTop.value === 'number' ? limitTop.value : 0,
      bottom: typeof limitBottom.value === 'number' ? limitBottom.value : 300,
      unit: 'px'
    }
  });
};

// 折叠状态下的区域限制摘要标签
const getRegionScopeBadge = (scope?: RegionScopeConfig): string => {
  if (!scope) return '';
  if (scope.baseType === 'step') {
    const stepNum = (scope.targetStepIndex ?? 0) + 1;
    return `[基于步骤#${stepNum}限制]`;
  }
  if ((scope.right ?? 0) > 0 || (scope.bottom ?? 0) > 0) {
    return `[限制: ${scope.right}x${scope.bottom}px]`;
  }
  return '';
};

// 获取动作分类标签
const getActionCategoryLabel = (type: ActionType): string => {
  if (type.startsWith('click_') || type === 'ai_click') return '点击';
  if (type.startsWith('drag_') || type === 'scroll') return '拖动';
  if (type.startsWith('input_') || type === 'paste_clipboard' || type === 'clear_and_input') return '输入';
  if (type.startsWith('open_')) return '打开';
  if (type.startsWith('run_')) return '运行';
  if (type.startsWith('wait_') || type === 'save_screenshot') return '界面';
  return '高级';
};

// 获取默认标题
const getActionDefaultTitle = (type: ActionType): string => {
  switch (type) {
    case 'click_position':
      return '点击指定坐标';
    case 'click_image':
      return '点击图片';
    case 'click_text':
      return '点击文字 (OCR)';
    case 'click_color':
      return '点击颜色';
    case 'click_node':
      return '点击节点';
    case 'ai_click':
      return 'AI点击';
    case 'drag_line':
      return '拖动直线';
    case 'drag_curve':
      return '拖动曲线';
    case 'scroll':
      return '鼠标滚动';
    case 'input_text':
      return '输入文本';
    case 'paste_clipboard':
      return '粘贴剪贴板';
    case 'clear_and_input':
      return '清空并输入';
    case 'open_app':
      return '打开应用';
    case 'open_url':
      return '打开网址';
    case 'open_file':
      return '打开文件';
    case 'run_shell':
      return '运行 Shell 脚本';
    case 'run_applescript':
      return '运行 AppleScript';
    case 'wait_text_appear':
      return '等待文字出现';
    case 'wait_text_disappear':
      return '等待文字消失';
    case 'save_screenshot':
      return '截图保存';
    case 'delay':
      return '延时等待';
    case 'condition':
      return '条件判断';
    default:
      return '动作操作';
  }
};

// 图标适配
const getActionIcon = (type: ActionType) => {
  switch (type) {
    case 'click_text':
      return Type;
    case 'drag_line':
      return ArrowUpRight;
    case 'drag_curve':
      return Spline;
    case 'scroll':
      return Mouse;
    case 'input_text':
    case 'clear_and_input':
      return PenTool;
    case 'open_app':
    case 'open_url':
      return ExternalLink;
    case 'run_shell':
    case 'run_applescript':
      return Terminal;
    case 'wait_text_appear':
    case 'wait_text_disappear':
      return Eye;
    case 'delay':
      return Clock;
    case 'click_position':
    default:
      return Crosshair;
  }
};

// 图标徽标背景颜色
const getActionIconBadgeClass = (type: ActionType) => {
  if (type === 'click_text') return 'bg-amber-500/10 text-amber-400';
  if (type === 'drag_line') return 'bg-emerald-500/10 text-emerald-400';
  if (type === 'drag_curve') return 'bg-purple-500/10 text-purple-400';
  if (type === 'scroll') return 'bg-cyan-500/10 text-cyan-400';
  if (type.startsWith('input_') || type === 'clear_and_input') return 'bg-rose-500/10 text-rose-400';
  return 'bg-blue-500/10 text-blue-400';
};

// 是否为当前正在执行的动作
const isCurrentRunning = computed(() => {
  return (
    scriptStore.executionStatus.value === 'running' &&
    scriptStore.currentStepIndex.value === props.index
  );
});

// 获取按键标签
const getButtonLabel = (btn: MouseButton) => {
  switch (btn) {
    case 'left':
      return '左键';
    case 'double':
      return '双击';
    case 'right':
      return '右键';
    default:
      return '点击';
  }
};

// 切换展开/收起
const toggleExpand = () => {
  props.action.isExpanded = !props.action.isExpanded;
};

// 切换启用/禁用
const toggleEnabled = () => {
  props.action.isEnabled = !props.action.isEnabled;
};

// 切换动作类型
const changeActionType = (newType: ActionType) => {
  if (props.action.type === newType) return;
  const currentRegionScope = props.action.regionScope || { type: 'mask' };
  const templ = createDefaultAction(newType);

  // 保留用户配置过的通用字段
  const originalName = props.action.name;
  const originalWait = props.action.customWaitSeconds;
  const originalEnabled = props.action.isEnabled;

  Object.keys(props.action).forEach(key => {
    if (key !== 'id' && key !== 'isExpanded') {
      delete (props.action as any)[key];
    }
  });

  Object.assign(props.action, templ, {
    name: originalName || templ.name,
    customWaitSeconds: originalWait,
    isEnabled: originalEnabled,
    regionScope: currentRegionScope
  });
};

// 需求 3.1: 启动蒙版拾取点坐标
const pickMaskPoint = async (targetField: string) => {
  await startMaskPointPicking({
    actionId: props.action.id,
    targetField,
    actionName: props.action.name
  });
};

// 需求 3.2: 启动蒙版拉框选区
const selectCustomROI = async () => {
  ensureRegionScope();
  props.action.regionScope!.baseType = 'mask';
  await startMaskROISelection({
    actionId: props.action.id,
    actionName: props.action.name
  });
};

// 需求 3.3: 启动测算相对偏移
const measureRelativeOffset = async () => {
  ensureRegionScope();
  props.action.regionScope!.baseType = 'step';
  await startMaskOffsetMeasurement({
    actionId: props.action.id,
    actionName: props.action.name,
    targetStepIndex: props.action.regionScope?.targetStepIndex
  });
};
</script>
