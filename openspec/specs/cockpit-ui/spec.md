# Cockpit UI Specification

## Purpose

定义 v0.4 Cockpit UI / 驾驶舱 UI 的 side panel shell、核心 Tab Data 视图、run 控制、timeline、tool inspector、trace detail 和组件化边界。

## Requirements

### Requirement: Cockpit UI 产品边界
系统 MUST 提供 **Cockpit UI / 驾驶舱 UI** 作为 BrowserHelm extension side panel 的用户控制面。

#### Scenario: Side panel 展示 Cockpit UI
- **WHEN** 用户打开 BrowserHelm extension side panel
- **THEN** 系统 MUST 展示 Cockpit UI
- **THEN** UI MUST 使用 BrowserHelm 产品语言，而不是把界面描述为普通 side panel demo

#### Scenario: Entry point 不承载主体 UI
- **WHEN** 实现 v0.4 Cockpit UI
- **THEN** `src/entrypoints/sidepanel/app.tsx` MUST 只保留 entrypoint、provider 或 extension glue
- **THEN** 主体 UI MUST 拆分到 `src/ui/**` 下的组件、stores、lib 或 styles

### Requirement: 核心 Tab Data 视图
Cockpit UI MUST 展示页面观察、Ref 映射、交互元素和表单字段四类核心 Tab Data。

#### Scenario: 四个核心 tab 可见
- **WHEN** Cockpit UI 获得包含 Structured Page Data 的 run snapshot
- **THEN** UI MUST 提供“页面观察”“Ref 映射”“交互元素”“表单字段”四个视图入口
- **THEN** 每个视图 MUST 展示对应数据的 ready、empty、unsupported 或 error 状态

#### Scenario: Tab Data 不反向注入模型上下文
- **WHEN** UI 展示完整 Tab Data 或 ToolResult detail
- **THEN** 系统 MUST NOT 因 UI 展示而把完整数据注入下一轮模型上下文
- **THEN** Agent context MUST 继续只接收 ContextPolicy 约束下的摘要

### Requirement: Run 控制与状态展示
Cockpit UI MUST 支持任务输入、Run Mode 选择、Start、Stop 和 run state 可视化。

#### Scenario: 用户启动 run
- **WHEN** 用户输入任务、选择 Run Mode 并点击 Start
- **THEN** UI MUST 通过 RuntimePort 发起 run
- **THEN** run input MUST 包含用户选择的 mode

#### Scenario: 用户停止 run
- **WHEN** 用户点击 Stop
- **THEN** UI MUST 调用 RuntimePort.cancelRun
- **THEN** UI MUST 展示 runtime 返回的 cancelled 或等价终止状态

#### Scenario: RunStateBadge 展示细粒度状态
- **WHEN** run snapshot 或 runtime event 包含 observing、thinking、executing_tool、waiting_for_approval、waiting_for_user、recovering、finished、failed 或 cancelled 状态
- **THEN** Cockpit UI MUST 使用 RunStateBadge 或等价组件展示对应状态

### Requirement: Timeline 与 Tool Inspector
Cockpit UI MUST 展示 step timeline、tool result detail 和 trace detail。

#### Scenario: Timeline 展示 runtime events
- **WHEN** run trace 包含 tool call、tool result、approval、error 或 terminal event
- **THEN** StepTimeline MUST 展示这些 event 的用户可读摘要

#### Scenario: ToolInspector 展示完整工具结果
- **WHEN** 用户选择某个 tool step
- **THEN** ToolInspector MUST 展示 tool name、args preview、result code、summary、changedPage、requiresObserve 和 requiresApproval
- **THEN** ToolInspector MUST mask 敏感字段值

#### Scenario: Trace detail 可检查但不可 replay
- **WHEN** 用户查看 trace detail
- **THEN** Cockpit UI MUST 展示 trace event 列表或选中 event detail
- **THEN** v0.4 MUST NOT 实现 trace replay

### Requirement: RuntimePort UI 边界
Cockpit UI MUST 只通过 RuntimePort 与 runtime 交互。

#### Scenario: UI 不直接导入 Agent 内核
- **WHEN** 构建或测试 Cockpit UI
- **THEN** `src/ui/**` MUST NOT import `src/agent/kernel`
- **THEN** `src/ui/**` MUST NOT import `src/tools/core`
- **THEN** `src/ui/**` MUST NOT import `src/agent/model`

#### Scenario: UI 单测使用 FakeRuntimePort
- **WHEN** 运行 Cockpit UI 单测
- **THEN** 测试 MUST 使用 FakeRuntimePort 或等价 fake runtime
- **THEN** 测试 MUST NOT 调用真实 AgentLoop、真实模型或真实 Chrome API

### Requirement: 窄 Side Panel 适配
Cockpit UI MUST 优先适配 Chrome extension side panel 的窄宽度。

#### Scenario: 窄宽度下内容不重叠
- **WHEN** Cockpit UI 在窄 side panel 宽度下渲染
- **THEN** 任务输入、tab、timeline、inspector、approval 和 settings 控件 MUST NOT 出现文本或控件重叠
- **THEN** 关键操作 MUST 可滚动访问

#### Scenario: Inspector 在窄宽度下降级
- **WHEN** side panel 宽度不足以展示桌面双栏
- **THEN** ToolInspector 或 Trace detail MUST 以折叠区、drawer 或上下布局展示
- **THEN** UI MUST NOT 依赖桌面工作台布局完成核心任务
