## ADDED Requirements

### Requirement: Agent Streaming Side Panel
v1.0.1 side panel MUST use a single BrowserHelm Agent waterfall as the default product experience.

#### Scenario: 默认展示 Agent 瀑布流
- **WHEN** 用户打开 BrowserHelm side panel
- **THEN** UI MUST 展示 BrowserHelm Agent 瀑布流、页面摘要、底部输入栏和 Debug 折叠入口
- **THEN** UI MUST NOT 默认展示“页面观察 / Ref 映射 / 交互元素 / 表单字段”四个产品一级 Tab

#### Scenario: 产品名统一
- **WHEN** v1.0.1 side panel 渲染 header
- **THEN** 产品名 MUST 显示为 `BrowserHelm`
- **THEN** 默认首屏 MUST NOT 使用 `BrowserHelm Cockpit` 或等价数据驾驶舱命名

### Requirement: Agent 输入栏
v1.0.1 side panel MUST 保留产品化任务输入栏，包含 mode 胶囊下拉、任务输入和发送按钮。

#### Scenario: 输入栏可发起任务
- **WHEN** 用户输入任务并点击发送按钮
- **THEN** UI MUST 通过 RuntimePort 发起 run
- **THEN** 输入栏 MUST 保持当前 mode 胶囊下拉语义
- **THEN** 发送按钮 MUST 使用 lucide 或等价图标按钮

#### Scenario: 窄 side panel 可用
- **WHEN** side panel 宽度为 Chrome 常见窄宽度
- **THEN** 输入栏 MUST 100% 适配容器宽度
- **THEN** mode 下拉、输入框和发送按钮 MUST NOT 重叠或溢出不可点击

### Requirement: 高级开发者选项
v1.0.1 side panel MUST 将 Debug 数据收敛到默认折叠的高级开发者选项。

#### Scenario: Debug 默认折叠
- **WHEN** 普通用户打开 side panel
- **THEN** 高级开发者选项 SHOULD 默认为折叠
- **THEN** 主 UI MUST 仍能完成页面摘要、诊断结论和建议展示

#### Scenario: Debug 只保留四个 Tab
- **WHEN** 用户展开高级开发者选项
- **THEN** Debug MUST 只提供 Trace、工具、元素与表单、Streaming 四个 Tab 或等价四类入口
- **THEN** Debug MUST NOT 原样迁入旧四个产品一级 Tab

### Requirement: 旧 Cockpit UI 清理
v1.0.1 implementation MUST remove unused old Cockpit UI code rather than hiding it.

#### Scenario: 旧四 Tab 产品入口删除
- **WHEN** v1.0.1 side panel 实现完成
- **THEN** 旧四 Tab 产品一级导航 MUST 被删除或迁移到新 Debug 边界
- **THEN** 系统 MUST NOT 仅通过 CSS hidden 或 unreachable branch 保留旧产品入口

#### Scenario: 无引用旧代码清理
- **WHEN** 旧 UI 组件、CSS class、测试 selector 或 imports 不再被 v1.0.1 使用
- **THEN** 它们 MUST 被删除
- **THEN** 清理结果 MUST 通过 typecheck、lint、tests 或 `rg` 复查

## MODIFIED Requirements

### Requirement: 核心 Tab Data 视图
Cockpit UI 的四类核心 Tab Data 在 v1.0.1 MUST 不再作为默认产品一级导航展示；这些数据 MAY 被 Debug 的“元素与表单”或 Trace/工具视图消费。

#### Scenario: 四个旧 Tab 不再默认可见
- **WHEN** v1.0.1 UI 获得包含 Structured Page Data 的 run snapshot
- **THEN** 默认产品 UI MUST NOT 展示“页面观察”“Ref 映射”“交互元素”“表单字段”四个并列一级入口
- **THEN** 对应数据 MAY 在 Debug 内以合并表、摘要卡或脱敏详情形式展示

### Requirement: Timeline 与 Tool Inspector
v1.0.1 MUST 将 timeline 和 tool inspector 从默认产品主体验降级为 Debug 信息，普通 UI 使用 Agent message 展示产品化状态。

#### Scenario: 主 UI 不显示 raw timeline
- **WHEN** run trace 包含 tool call、tool result、approval、streaming 或 terminal event
- **THEN** 默认 UI MUST 展示用户可读 Agent 状态 message
- **THEN** Trace/工具原始细节 MUST 只在高级开发者选项中展示
