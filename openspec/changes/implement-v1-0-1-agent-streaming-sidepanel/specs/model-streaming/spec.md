## ADDED Requirements

### Requirement: OpenAI-compatible Streaming
系统 MUST 为 OpenAI-compatible provider 提供真实 token/chunk streaming。

#### Scenario: Streaming 请求
- **WHEN** provider settings 启用 streaming 且当前 provider 为 OpenAI-compatible
- **THEN** model client MUST 发送 streaming chat completion 请求或等价请求
- **THEN** runtime MUST 能接收并合并 chunk 文本

#### Scenario: Streaming 更新 AgentMessage
- **WHEN** streaming delta 到达
- **THEN** runtime MUST 更新当前 streaming AgentMessage content 或等价可恢复状态
- **THEN** side panel MUST 能显示逐步生成的 Agent 回复

### Requirement: Streaming Fallback
系统 MUST 在 streaming 不可用或失败时 fallback 到非流式完成模式。

#### Scenario: 启动前失败
- **WHEN** streaming 请求启动前因 provider 不支持、网络或配置错误失败
- **THEN** runtime MUST 尝试使用非流式 `complete()` 完成同一模型输出
- **THEN** Debug Streaming Tab MUST 能显示 fallback reason

#### Scenario: 中途失败
- **WHEN** streaming 中途断开或 chunk 解析失败且未得到完整可用输出
- **THEN** runtime MUST 尝试 fallback 到非流式 `complete()`
- **THEN** 默认 UI MUST 用用户可读提示说明已重新完成或失败

#### Scenario: Fallback 也失败
- **WHEN** streaming 和 fallback 均失败
- **THEN** run MUST 进入 error 或 failed 状态
- **THEN** Debug MUST 展示结构化错误码和原因

### Requirement: Stream Trace 限流
Streaming trace MUST avoid logging every token as a full trace row.

#### Scenario: Chunk summary
- **WHEN** streaming 产生多个 token/chunk
- **THEN** trace SHOULD 记录 start、summary delta、finish、failed、fallback 等 lifecycle event
- **THEN** trace MUST NOT 因每个 token 明文 payload 造成 Debug 刷屏

### Requirement: Streaming Debug Tab
高级开发者选项 MUST 提供 Streaming Tab 展示 streaming 诊断信息。

#### Scenario: 展示 streaming 状态
- **WHEN** 用户打开 Debug Streaming Tab
- **THEN** UI MUST 展示 provider/model、streaming enabled、active、chunk count、duration、fallback used、fallback reason 和 final preview
- **THEN** UI MUST NOT 展示 API Key 明文
