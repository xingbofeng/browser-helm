## Why

BrowserHelm v1.0 已经把首发产品边界收敛为 Page Inspector / 页面检查员 与 Form Doctor / 表单医生，但当前 side panel 仍然继承 v0.4 Cockpit 的“数据驾驶舱”形态：四个产品一级 Tab 暴露页面观察、Ref 映射、交互元素和表单字段，Trace、工具结果和 Settings 也在主体验中占据大量空间。

这套 UI 对开发者排障有价值，但对 v1.0 真实产品用户过载。用户打开 BrowserHelm 后更需要看到一个 Agent 正在观察页面、生成页面摘要、给出诊断结论和下一步建议，而不是自己在多个数据 Tab 之间拼结论。同时，用户已经明确要求 v1.0.1 做真实 streaming，而不是只做 UI 假流式；也要求没用的旧代码要删除，不能仅隐藏旧 Cockpit 面板。

v1.0.1 因此需要把 v0.4 Cockpit 产品化为 **Agent Streaming Side Panel**：单 Agent 聊天瀑布流、真实模型 token/chunk streaming、工具 event streaming、可恢复 AgentMessage、精简 Debug、模型配置弹窗，以及旧 UI 代码清理。

## What Changes

- 将 BrowserHelm side panel 默认体验从四个一级数据 Tab 改为单 Agent 聊天瀑布流。
- 引入可恢复的 `AgentMessage[]`，写入 `RunSnapshot.messages`，默认 UI 从 message 渲染，而不是从 raw trace 临时拼主体验。
- 实现 OpenAI-compatible provider 的真实 token/chunk streaming，并在 streaming 失败时 fallback 到原非流式 `complete()`。
- 工具执行和 runtime 生命周期继续使用 event streaming；普通 UI 展示产品化状态，Debug 才展示内部事件和 raw payload 摘要。
- 默认打开 side panel 后自动执行一次 readonly 页面观察 run，生成页面摘要与第一条 Agent 状态消息。
- 保留当前输入栏模式：左侧 mode 胶囊下拉、中心任务输入、右侧 lucide `Send` 图标按钮。
- 右上角三个点打开模型配置弹窗，支持 API Key、Base URL、Model、Streaming 开关、测试连接和本地保存。
- Provider 配置只保存在本地扩展存储；API Key 默认 mask，不进入 trace、AgentMessage、Debug payload、截图或测试快照。
- 引入 `animal-island-ui` 作为真实 UI 依赖；其覆盖不了的 BrowserHelm 业务组件参考其视觉自写，并搭配 lucide 图标。
- “高级开发者选项”默认折叠，展开后只保留四个 Debug Tab：Trace、工具、元素与表单、Streaming。
- 将 Ref 映射、交互元素和表单字段合并为一张“元素与表单”表，支持搜索、chips 过滤和选中详情。
- 删除不再使用的旧四 Tab 产品入口、旧 Cockpit 布局分区、重复 Settings 入口、旧 CSS class 和无引用组件代码。

## Capabilities

### New Capabilities

- `agent-streaming-sidepanel`: 定义 v1.0.1 单 Agent side panel、Agent 瀑布流、输入栏、自动观察、Debug 抽屉和旧 UI 清理边界。
- `agent-message-snapshot`: 定义可恢复 `AgentMessage` 消息模型、状态、刷新恢复和主 UI / Debug 数据分离。
- `model-streaming`: 定义 OpenAI-compatible token/chunk streaming、stream lifecycle events、fallback、chunk summary 和 Debug Streaming tab。
- `model-config-modal`: 定义右上角模型配置弹窗、API Key masking、本地保存、Streaming 开关和测试连接。
- `debug-minimal-tabs`: 定义 Trace / 工具 / 元素与表单 / Streaming 四个 Debug Tab，以及 Ref/交互元素/表单字段合并表。

### Modified Capabilities

- `cockpit-ui`: v0.4 Cockpit UI 不再作为 v1.0.1 默认产品形态；四个核心 Tab Data 从产品一级导航降级并收敛到 Debug 数据。
- `cockpit-settings`: Provider Settings 从主 Debug/Settings 面板迁移到右上角模型配置弹窗，并新增 streaming 开关和测试连接。
- `agent-kernel`: RunSnapshot 扩展 `messages` 和 `streaming` 状态，runtime event 增加 model stream lifecycle。
- `structured-page-data`: 结构化页面数据继续保留完整 observation/ref/interactive/form 信息，但 v1.0.1 UI 将其合并渲染为 Debug “元素与表单”表。
- `page-observation`: 自动观察成为 side panel 首屏默认 readonly 行为，观察结果用于页面摘要 message。

## Impact

- 影响 `src/agent/model/**`：扩展 ModelClient streaming 能力，实现 OpenAI-compatible SSE/chunk parser 和 fallback。
- 影响 `src/runtime/**` 与 `src/background/runtime/**`：扩展 RuntimePort、RunSnapshot、runtime events、RunManager message 状态和 provider test connection。
- 影响 `src/shared/schemas/**`：新增 AgentMessage、StreamingState、ProviderTestResult 等 schema。
- 影响 `src/storage/**`：扩展 provider settings，增加 `streamingEnabled` 和测试状态边界，继续 mask API Key。
- 影响 `src/ui/**`：重构 side panel 为 Agent 瀑布流、模型配置弹窗、Debug 抽屉和合并表，删除旧 Cockpit UI 残留。
- 影响 `src/entrypoints/sidepanel/**`：保持 entrypoint glue 边界，接入新的 side panel shell 和 animal-island-ui 样式。
- 影响 `tests/node/**`、`tests/dom/**`、`tests/e2e/**`：覆盖 streaming/fallback、message 恢复、模型配置、Debug tabs、合并表、旧代码清理和真实 extension 验证。
- 影响 `docs/design/**`、`docs/roadmap/**`、`implementation-notes.md` 和 OpenSpec specs。

## Non-goals

- 不做完整多轮聊天、conversation list、长期 memory 或 workflow replay。
- 不做自动填写、批量填写、verify、submit-with-approval 或新的高风险动作。
- 不做所有 provider 的 streaming 适配；v1.0.1 只承诺 OpenAI-compatible。
- 不做云同步、账号系统、团队配置或远程 key vault。
- 不把每个 token 都写成完整 trace 行。
- 不把旧四 Tab 隐藏后继续维护。
