## 1. 契约与数据模型

- [x] 1.1 新增 `AgentMessage`、`StreamingState`、`ProviderTestResult` schema/type。
- [x] 1.2 扩展 `RunSnapshot.messages` 和 `RunSnapshot.streaming`。
- [x] 1.3 扩展 runtime event names：model stream start/delta/finish/failed/fallback、provider test start/finish/failed。
- [x] 1.4 为新增 schema 编写 node 单测，覆盖默认值、错误值、敏感字段边界。
- [x] 1.5 更新 roadmap/design/CONTEXT 或相关术语文档，明确 v1.0.1 与 v1.0/v1.1 边界。

## 2. Model Streaming 与 Provider Test

- [x] 2.1 为 OpenAI-compatible SSE parser 编写测试，覆盖正常 chunk、done、空 delta、错误事件、非 JSON 行。
- [x] 2.2 扩展 `ModelClient` 或新增 streaming adapter，保留非流式 `complete()` 兼容路径。
- [x] 2.3 实现 `OpenAICompatibleClient` streaming 请求和 chunk 合并。
- [x] 2.4 实现 streaming fallback：启动失败、中途失败、解析失败回退到 `complete()`。
- [x] 2.5 实现 provider test connection runtime API，测试中使用 mock fetch，不打真实 provider。
- [x] 2.6 确保 provider key 不进入 stream events、trace payload、错误信息或 test snapshot。

**Quality Gate:**
- [x] `tests/node/agent/model/**` 通过。
- [x] provider streaming/fallback 单测覆盖失败路径。

## 3. Runtime 与 Snapshot 恢复

- [x] 3.1 扩展 `RuntimePort` / `ExtensionRuntimePort` / `FakeRuntimePort`，支持 provider test 和 streaming snapshot 字段。
- [x] 3.2 扩展 `RunManager`，在 start/observe/tool/model stream/fallback/finish 时更新 `AgentMessage[]`。
- [x] 3.3 自动观察 run 生成页面摘要 message，且只使用 readonly 工具。
- [x] 3.4 订阅 runtime events 时更新 snapshot/message，刷新 side panel 后能恢复已生成内容。
- [x] 3.5 确保 cancel/approval/error/recovering 状态能生成产品化 message，同时保留 Debug trace。

**Quality Gate:**
- [x] `tests/node/runtime/**` 相关测试通过。
- [x] FakeRuntimePort 可驱动 UI 单测覆盖 streaming 中和完成态。

## 4. Agent Side Panel UI

- [x] 4.1 引入 `animal-island-ui` 和 sidepanel 限定样式入口；保留授权风险记录。
- [x] 4.2 重构 side panel shell 为 BrowserHelm header、Agent waterfall、底部输入栏、Debug 抽屉。
- [x] 4.3 保留当前 mode 胶囊下拉样式和语义，底部输入栏 100% 宽度可点击。
- [x] 4.4 实现 AgentMessageList、PageSummaryCard、DiagnosisCard、RecommendationCard、Fallback/Error message。
- [x] 4.5 默认 UI 不显示 raw JSON、`ref_id`、chunk、trace payload。
- [x] 4.6 更新样式测试，覆盖窄 side panel 下文本不重叠、输入栏不溢出。

**Quality Gate:**
- [x] UI 单测通过。
- [x] 样式快照或 CSS 断言覆盖 430px side panel。

## 5. 模型配置弹窗

- [x] 5.1 实现右上角 MoreHorizontal 设置入口和 `ModelConfigModal`。
- [x] 5.2 支持 API Key masked input、Base URL、Model、Streaming 开关、保存/取消。
- [x] 5.3 支持“测试连接”按钮，展示连接成功、失败、supports streaming 状态。
- [x] 5.4 扩展 settings store：`streamingEnabled` 默认 true；API Key 只展示 masked preview。
- [x] 5.5 确保保存不会自动测试连接，测试连接不会启动 Agent run。

**Quality Gate:**
- [x] `model-config-modal` 和 settings store 测试通过。
- [x] API Key masking 测试覆盖 DOM 与 trace。

## 6. 高级开发者选项

- [x] 6.1 实现 AdvancedDebugDrawer，默认折叠，本地记忆展开状态。
- [x] 6.2 实现 Trace Tab：event summary + 脱敏 payload 预览，不逐 token 刷屏。
- [x] 6.3 实现 工具 Tab：最新工具结果、错误码、summary、flags、脱敏详情。
- [x] 6.4 实现 元素与表单 Tab：合并 Ref / 交互元素 / 表单字段，支持搜索和 chips。
- [x] 6.5 实现 Streaming Tab：provider/model、enabled、active、chunk count、duration、fallback、final preview。
- [x] 6.6 删除或迁移旧 Debug 中重复的 timeline/settings/tab wrapper。

**Quality Gate:**
- [x] Debug 四 Tab UI 单测通过。
- [x] 敏感值 masking 测试通过。

## 7. 旧代码清理

- [x] 7.1 删除旧四 Tab 产品一级导航和 `BrowserHelm Cockpit` 首屏标题。
- [x] 7.2 复查并删除无引用旧组件、旧 CSS class、旧测试 selector 和旧 imports。
- [x] 7.3 若旧 tab 组件逻辑被复用，重命名或迁移到新 Debug 组件边界。
- [x] 7.4 删除重复 Settings 主面板入口，保留模型配置弹窗。
- [x] 7.5 使用 `rg` 记录旧代码清理结果，并写入 `implementation-notes.md`。

**Quality Gate:**
- [x] `rg` 不出现无引用旧入口和旧 selector。
- [x] `npm run typecheck` 与 `npm run lint` 通过。

## 8. E2E、截图与收口

- [x] 8.1 更新 E2E POM：Agent waterfall、模型配置弹窗、Debug drawer、Debug tabs、Streaming 状态。
- [x] 8.2 新增/更新 E2E：自动观察、发送任务、刷新恢复、Debug 展开、模型配置保存和测试连接 mock。
- [x] 8.3 使用 Chrome for Testing debug SOP 截图验证默认态、Debug 展开态、模型配置弹窗。
- [x] 8.4 运行 `npx openspec validate implement-v1-0-1-agent-streaming-sidepanel --strict`。
- [x] 8.5 运行 `npm run typecheck`。
- [x] 8.6 运行 `npm run lint`。
- [x] 8.7 运行相关 node/dom/ui 测试。
- [x] 8.8 运行 `npm run build`。
- [x] 8.9 运行 extension side panel 相关 E2E 或 `npm run test:e2e`。
- [x] 8.10 更新 `implementation-notes.md`，记录 streaming、Debug 收敛、旧代码删除和授权风险。

## Completion Checklist

- [x] 所有任务完成。
- [x] 所有 quality gates 通过。
- [x] 设计稿、roadmap、OpenSpec 和 implementation notes 同步。
- [x] 旧 UI 清理完成，无隐藏维护路径。
- [x] 准备进入 `/openspec-apply implement-v1-0-1-agent-streaming-sidepanel`。
