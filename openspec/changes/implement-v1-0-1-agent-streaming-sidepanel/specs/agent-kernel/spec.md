## ADDED Requirements

### Requirement: AgentMessage Snapshot
Runtime MUST expose recoverable AgentMessage data for v1.0.1 product UI.

#### Scenario: RunSnapshot 包含 messages
- **WHEN** run 创建、观察页面、执行工具、生成模型回复或结束
- **THEN** RunSnapshot MUST 包含可选 `messages` 或等价产品消息字段
- **THEN** messages MUST 足以让 side panel 刷新后恢复 Agent 瀑布流

#### Scenario: Message 与 Trace 分离
- **WHEN** runtime 记录完整 trace 或 ToolResult
- **THEN** 完整 Debug 数据 MUST 保留在 trace/storage
- **THEN** AgentMessage MUST 只包含产品 UI 所需的摘要、状态和可读内容

### Requirement: Streaming State Snapshot
Runtime MUST expose structured streaming state for Debug and recovery.

#### Scenario: RunSnapshot 包含 streaming 状态
- **WHEN** 当前 run 使用 streaming、fallback 或完成模型输出
- **THEN** RunSnapshot MUST 包含 streaming enabled、active、chunk count、fallback used、fallback reason、started/finished 或等价字段
- **THEN** API Key MUST NOT 出现在 streaming 状态中

### Requirement: AgentMessage 敏感数据边界
AgentMessage MUST NOT persist sensitive provider credentials or sensitive page values.

#### Scenario: API Key 不进入 messages
- **WHEN** 用户保存 provider settings 或发起模型请求
- **THEN** AgentMessage content/title/debugEventIds MUST NOT 包含完整 API Key
- **THEN** Debug 和 trace 也 MUST NOT 通过 message 引用泄露 API Key

#### Scenario: 页面敏感值遮蔽
- **WHEN** AgentMessage 引用表单字段、password、token、otp 或 API key 语义内容
- **THEN** message MUST 使用 masked preview 或摘要
- **THEN** 明文敏感值 MUST NOT 出现在默认 UI

## MODIFIED Requirements

### Requirement: Run Metadata 与 Trace 一致性
RunMetadata 与 Trace 契约 MUST 支持 v1.0.1 streaming 与 AgentMessage 恢复，但仍必须排除敏感信息。

#### Scenario: Streaming 元信息可追踪
- **WHEN** model streaming 启动、delta、完成、失败或 fallback
- **THEN** trace MAY 记录 stream lifecycle event、chunk count、耗时和 fallback reason
- **THEN** trace MUST NOT 记录完整 API Key 或未脱敏 provider secret
