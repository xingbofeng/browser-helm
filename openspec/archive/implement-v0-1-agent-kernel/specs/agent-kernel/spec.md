# Delta：Agent Kernel v0.1

**变更 ID：** `implement-v0-1-agent-kernel`
**影响范围：** `agent runtime`、`tool contracts`、`trace contracts`、`context policy`、`approval protocol primitives`

---

## ADDED Requirements

### Requirement: 工具结果压缩边界

运行时 MUST 将“完整工具结果”和“模型可见上下文”分离。完整 `ToolResult` payload 保留到 trace/storage，模型输入只能接收 `ContextPolicy` 约束下的压缩摘要。

#### Scenario: 完整 trace 与压缩上下文
- GIVEN 某工具返回较大的 `ToolResult.data`
- WHEN loop 记录当前 step 并准备下一轮上下文
- THEN 完整结果写入 trace
- AND 模型上下文仅包含在策略限制内的压缩字段/摘要

#### Scenario: 上下文可见性控制
- GIVEN 工具设置 `context.visibility`
- WHEN 构建下一轮上下文
- THEN `hidden` 不把完整结果注入模型上下文
- AND `summary` 使用 `context.summary` 或 `summary`
- AND `full` 仍受策略限制，仅允许短内容且低风险场景

---

### Requirement: 最小 HITL 协议表达

v0.1 MUST 在协议与 trace 中表达高风险工具行为，但不实现完整审批生命周期。

#### Scenario: approval-required 状态表达
- GIVEN 某工具结果包含 `requiresApproval = true`
- WHEN loop 处理该结果
- THEN runtime 写入 `approval_required` trace event
- AND loop session 状态可进入 `waiting_for_approval` / `paused`

#### Scenario: v0.1 不实现完整审批流程
- GIVEN approval 协议 schema 与错误码已定义
- WHEN 执行 v0.1 runtime
- THEN 本版本不要求完整 approve/deny 编排 UI/runtime 流程

---

### Requirement: 不引入 Planner 的 Goal/Intent 预留

v0.1 MUST 预留 goal 与当前 turn intent 字段，但不引入 planning 或任务拆解行为。

#### Scenario: 输入与 step 字段预留
- GIVEN run 以 `task` 启动，并可选携带 `goal`、`successCriteria`、`maxSteps`
- WHEN runtime 创建 loop 状态与 trace 记录
- THEN 这些字段必须保留用于可追踪性
- AND 当前 turn 可记录 `intent`

#### Scenario: 排除 planner 行为
- GIVEN 已预留 goal 与 intent 字段
- WHEN 执行 v0.1 loop
- THEN runtime 不生成完整计划或任务拆解
- AND 不引入 planner 专用 decision 类型

---

## MODIFIED Requirements

### Requirement: Run Metadata 与 Trace 一致性

RunMetadata 与 Trace 契约 MUST 支持回放/诊断所需版本元信息，并 MUST 对敏感信息进行遮蔽或排除。

#### Scenario: 回放所需元信息可追踪
- GIVEN run 启动
- WHEN metadata 写入 trace
- THEN metadata 包含 `schemaVersion`、`promptVersion`、`toolSchemaVersion`、`contextPolicyVersion`、`model`
- AND 可选包含 `providerBaseUrl` 与 `modelCapabilities`

#### Scenario: 敏感信息不可持久化
- GIVEN 已配置 provider 凭据
- WHEN trace 记录模型输出或 metadata
- THEN `OPENAI_API_KEY` 必须被遮蔽或排除，不能出现在 trace payload 中

---

## REMOVED Requirements

(None)
