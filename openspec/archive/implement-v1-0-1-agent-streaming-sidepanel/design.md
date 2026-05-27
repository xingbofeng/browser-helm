# Design: v1.0.1 Agent Streaming Side Panel

## 1. 产品结构

v1.0.1 的 side panel 使用单列 Agent 产品结构：

```txt
BrowserHelm header
  ├─ 当前页面 / 状态摘要
  ├─ 右上角 MoreHorizontal -> 模型配置弹窗
Agent waterfall
  ├─ 用户任务 message
  ├─ 页面摘要 message
  ├─ Agent 状态 / streaming message
  ├─ 诊断结论 / 建议 message
Bottom input
  ├─ mode 胶囊下拉
  ├─ task input
  └─ Send icon button
Advanced developer options
  └─ Trace / 工具 / 元素与表单 / Streaming
```

默认 UI 不出现 raw JSON、`ref_id`、token/chunk、完整 trace payload。Debug 展开后才允许看到技术细节。

## 2. AgentMessage 与 Trace 分层

`RunSnapshot.trace` 继续是调试与复盘数据。`RunSnapshot.messages` 是产品 UI 稳定输入。

```ts
type AgentMessage = {
  id: string;
  role: 'user' | 'agent' | 'system';
  kind:
    | 'task'
    | 'page_summary'
    | 'agent_status'
    | 'diagnosis'
    | 'recommendation'
    | 'error';
  status: 'streaming' | 'complete' | 'error';
  title?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  debugEventIds?: string[];
};
```

消息生成规则：

- 用户提交任务时创建 `role=user kind=task`。
- 自动观察成功后创建或更新 `kind=page_summary`。
- 工具事件创建 `kind=agent_status` 产品化状态。
- 模型 stream delta 更新当前 `kind=diagnosis` 或 `kind=recommendation` message。
- fallback 或错误创建 `kind=error`，主 UI 用自然语言说明，Debug 保存详细原因。

## 3. Streaming 设计

OpenAI-compatible provider 增加 streaming 路径：

```txt
ModelClient.streamComplete(input, callbacks)
-> OpenAICompatibleClient fetch stream=true
-> parse SSE chunks
-> emit model_stream_started
-> emit model_stream_delta summary
-> update AgentMessage.content
-> emit model_stream_finished
```

fallback 规则：

- streaming 启动前失败：直接调用 `complete()`。
- streaming 中途失败且没有完整可解析结果：调用 `complete()`。
- streaming 已完成：使用 streaming 最终文本。
- fallback 也失败：run 进入 error，并输出 Debug 事件。

Trace 不记录每个 token 明文 payload。允许记录 chunk count、累计长度、耗时、fallback reason 和最终文本摘要。

## 4. 模型配置弹窗

右上角三个点打开模型配置弹窗。弹窗字段：

- API Key：默认 masked，可用 Eye icon 临时显示输入值。
- Base URL。
- Model。
- 启用流式输出：默认开启。
- 测试连接：真实最小 provider 请求，测试中使用 mock fetch。

设置只保存到本地扩展存储。API Key 不写入 trace、message、Debug、截图文案或测试快照。

## 5. Debug 最小集

Debug 只保留四个 Tab：

- Trace：event summary 和脱敏 payload 预览。
- 工具：最新工具结果、错误码、summary、flags 和脱敏 detail。
- 元素与表单：合并 Ref、交互元素和表单字段的一张表。
- Streaming：provider/model、enabled、active、chunk count、duration、fallback 和 final preview。

“元素与表单”合并表字段：

```txt
类型 | 名称/标签 | role/tag | 状态 | 校验/提交 | ref_id
```

表格支持搜索和 chips：全部、表单字段、按钮、异常、禁用。敏感值显示 `[MASKED]`。

## 6. UI 依赖与样式边界

v1.0.1 真实引入 `animal-island-ui`，优先用于 Button、Input、Switch、Modal、Card、Collapse/Tabs 等基础控件。业务组件如 AgentMessage、DebugDrawer、StreamingTab、ElementsFormsTable 可自写，但视觉 token 向 animal-island-ui 靠齐。

样式只在 sidepanel 边界引入，避免污染其他 extension entrypoint。若 `animal-island-ui` 授权或样式冲突不可接受，保留自写组件 fallback。

## 7. 旧代码清理

旧四 Tab 产品入口必须删除或迁移，不能仅 CSS 隐藏。迁移后需要复查：

- 旧 `PageObservationTab` / `RefMapTab` / `InteractiveElementsTab` / `FormFieldsTab` 是否仍被新 Debug 组件复用。
- 旧 `StepTimeline` 是否被 Trace summary 替代。
- 旧 `SettingsPanel` 是否完全被模型配置弹窗替代。
- 旧 CSS class、旧测试 selector、旧 imports 是否仍有引用。

清理验收使用 `rg`、TypeScript、lint 和测试共同确认。
