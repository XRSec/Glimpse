# Glimpse 自动化系统技术规范与架构文档 (System Architecture & Specifications)

本文档系统性沉淀 Glimpse 自动化系统的核心技术架构、数据流向、时序逻辑与 macOS 原生交互避坑准则。

---

## 一、 整体系统分层架构

```mermaid
flowchart TD
    subgraph UI ["表现层 (View Layer)"]
        A1["AddEditScript.vue<br>(保存状态/脏检查/视图调度)"]
        A2["ActionRow.vue<br>(动作单步卡片/测试触发)"]
        A3["ActionLimitConfig.vue<br>(限制区域配置/基准定位触发)"]
        A4["RegionMaskOverlay.vue<br>(蒙版视口/视觉选区/矩形闪避/准星)"]
    end

    subgraph Store ["状态与调度层 (Stores & Controller)"]
        S1["maskStore.ts<br>(视口几何/交互模式/广播同步)"]
        S2["automationController.ts<br>(中央调度/先画框后识别/OCR/定位)"]
        S3["scriptStore.ts<br>(脚本持久化/历史双键兼容/日志)"]
    end

    subgraph Native ["原生驱动与通信层 (Tauri IPC & Native Vision)"]
        N1["BroadcastChannel<br>(glimpse_window_sync_channel)"]
        N2["native_window.m<br>(穿透/透明通道/ESC全局监听)"]
        N3["native_vision.m<br>(全屏截屏/Apple Vision OCR)"]
        N4["native_app.m<br>(多屏幕感知/窗口自适应/强力激活)"]
        
        subgraph Driver ["双轨操作引擎 (Dual-Engine)"]
            N5["cua_driver.rs<br>(主引擎: cua-driver MCP 进程管理与 JSON-RPC)"]
            N6["simulator.rs<br>(Fallback: 纯底层 HID 0 级硬件鼠标派发)"]
        end
    end

    A1 --> S3
    A2 --> S2
    A3 --> S2
    A4 <--> S1
    S2 <--> S1
    S2 --> Native
    S1 <--> N1
    N1 <--> A4
    S2 --> N3
    S2 --> Driver
```

---

## 二、 关键技术突破与系统核心机制

### 1. 蒙版内部几何图形“毫秒级闪避”机制 (Rectangle Flash-Dodge)
- **痛点与困境**：
  - 蒙版窗口（`mask-overlay`）背景全透明，但其内部绘制的限制区域虚线框（`previewLimitBox`）、基准步骤框（`baseRoiBox`）及命中准星（`runHitAnchorBox`）包含像素填充与边框，在执行截屏时会与屏幕下方的真实文字重叠，严重干扰 Apple Vision OCR 文本识别。
  - 若在截屏时调用 `window.hide()` 隐藏整个蒙版窗口，会导致屏幕明显白闪/抽搐，甚至破坏底层应用的前台焦点。
- **技术实现**：
  - 蒙版窗口全程常驻屏幕，透明度不变，窗口不隐藏；
  - 仅在截屏取样的 25ms 瞬间，通过跨进程调度（Tauri eval `window.__glimpse_set_rects_visible(false)`）让蒙版内部绘制的几何矩形与准星临时隐藏；
  - 原生截屏取样完成后立即恢复（`window.__glimpse_set_rects_visible(true)`）；
  - 人眼无任何感知闪烁，截屏获取到的画面 100% 绝对纯净。

### 2. macOS 窗口层级 (Window Level) 与全局截屏避坑法则
- **陷阱真相**：
  - 过去使用 `pCGWindowListCreateImage(..., kCGWindowListOptionOnScreenBelowWindow, maskWinId, ...)` 试图剔除蒙版窗口自身。
  - macOS 体系中，应用右键上下文菜单（Context Menu / Pop-up Menu）创建于 `NSPopUpMenuWindowLevel`（值为 101），而蒙版悬浮窗口处于 `NSFloatingWindowLevel`（值为 3）。
  - `kCGWindowListOptionOnScreenBelowWindow` 仅包含层级严格低于蒙版的窗口，直接导致飞书右键弹出的上下文菜单（含“撤回”项）被系统在截屏中静默丢弃，OCR 无论如何都无法检测到菜单内容。
- **解决方案**：
  - 结合**矩形毫秒级闪避**，底层截屏全面使用 `kCGWindowListOptionOnScreenOnly`（全屏可见窗口捕获）。
  - 此时无论右键菜单、系统气泡还是对话框，均能 100% 完整清晰捕获。

### 3. macOS 底层 HID 硬件鼠标事件派发准则
- **陷阱真相**：
  - 过去尝试向 `CGEventTapLocation::HID` (0) 与 `CGEventTapLocation::Session` (1) 双重派发，或在点击前后调用 `CGWarpMouseCursorPosition`。
  - 导致飞书瞬间收到两次连续右键点击（菜单“抖了一下就没了”），且光标瞬移容易被系统抑制。
- **解决方案**：
  - 唯一底层硬件派发：仅向 `CGEventTapLocation::HID` 派发携带目标坐标的单次事件流（Down -> Up）。
  - 彻底杜绝 `CGWarpMouseCursorPosition`，保障右键菜单 100% 稳定弹出并常驻。

### 4. 双轨操作引擎架构 (Dual-Engine Fallback)
- **技术选型演进**：
  - 纯 `CGEvent` 模拟器存在需要系统全局辅助功能权限、不同分辨率坐标映射复杂、无法实现后台静默点击等痛点。
  - 为此引入了 `cua-driver` MCP 持久化进程作为主操作引擎。
- **架构实现**：
  - **Rust 侧生命周期托管**：直接在 `src-tauri/src/cua_driver.rs` 内通过 `std::process::Command` 孵化 `cua-driver mcp` 进程，并维护持久化的 JSON-RPC stdio 连接。采用 `tokio::task::spawn_blocking` 避免同步阻塞 Tauri 主线程。
  - **优雅降级 (Fallback)**：动作调度时，若目标应用 `pid` 获取失败或 cua-driver 调用抛出异常，前端会自动在 `catch` 块中拦截，并无缝降级调用原有的原生 `simulator.rs` (CGEvent) 派发，保证点击与拖拽的高可用性。

### 5. 代码文件行数规范（$\le 600$ 行铁律）
- **重构落地**：
  - 原 `native_vision.m`（1106 行）已按职责彻底拆解为 3 个轻量专精模块：
    1. `src-tauri/src/native_vision.m` (226 行)：Vision OCR 文字定位、图像截取与系统权限。
    2. `src-tauri/src/native_window.m` (271 行)：100% 透明通道、60fps 动态穿透计算、鼠标录制与 ESC 监听。
    3. `src-tauri/src/native_app.m` (467 行)：应用感知、跨屏窗口尺寸位置自适应与置顶激活。
  - 后端 `src-tauri/src/lib.rs` 严格精简压缩至 580 行，全员严格达标。

---

## 三、 蒙版矩形闪避调用时序

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户 / 脚本调度器
    participant Controller as automationController
    participant Lib as lib.rs (Rust 后端)
    participant Mask as RegionMaskOverlay.vue (前端蒙版)
    participant Vision as native_vision.m (Apple Vision)
    participant Driver as 双轨驱动 (CUA/Sim)

    User->>Controller: 触发单步测试或脚本 OCR 检索
    Controller->>Mask: 先画框：在蒙版上绘制限制区域虚线框与基准绿框
    Note over User,Mask: 限制框常驻屏幕，用户亲眼确认检索范围
    Controller->>Lib: 调用 find_text_position 
    Lib->>Mask: eval("__glimpse_set_rects_visible(false)") 隐藏限制矩形与准星
    Note over Mask: 蒙版窗口不隐藏，仅绘制的几何形状在 25ms 内隐藏
    Lib->>Vision: 全屏截屏 (包含 Level 101 的右键上下文菜单) 并运行 Vision OCR
    Lib->>Mask: eval("__glimpse_set_rects_visible(true)") 恢复矩形显示
    alt 检索命中
        Lib-->>Controller: 返回命中绝对物理坐标与文字范围
        Controller->>Driver: 尝试 cua-driver 点击
        alt cua-driver 失败
            Controller->>Driver: Fallback 到 simulator.rs 硬件派发
        end
    else 检索失败
        Lib-->>Controller: 返回超时未找到提示 (限制矩形依然常驻屏幕)
    end
```

---

## 四、 跨窗口多端同步通道 (`BroadcastChannel`)

使用通信通道：`glimpse_window_sync_channel`。

| 消息类型 (`type`) | 负载数据 (`payload`) | 业务用途 |
| :--- | :--- | :--- |
| `bounds_updated` | `{ bounds: { x, y, width, height } }` | 蒙版移动或缩放后，向主窗口同步物理坐标 |
| `visibility_updated` | `{ show, isMinimized, isFullscreen }` | 蒙版显隐状态双向广播 |
| `search_roi_updated` | `{ roi: { x, y, width, height, label } }` | 蓝色虚线限制区域矩形实时绘制与更新 |
| `run_hit_anchor_updated` | `{ anchor: { x, y, width, height, stepIndex } }` | 命中点/基准点绿色准星方框实时绘制与更新 |
| `base_marker_updated` | `{ stepIndex, marker }` | 步骤基准坐标缓存跨窗口实时共享 |
| `mask_interaction_start` | `{ context: { mode, baseMarker, ... } }` | 激活框选限制区域、十字准星取点、查看标记等交互状态 |
