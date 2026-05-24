# 提案：实现 v0.1 Agent Kernel

**变更 ID：** `implement-v0-1-agent-kernel`
**创建日期：** 2026-05-24
**状态：** 实现完成
**完成日期：** 2026-05-24

---

## 问题陈述

BrowserHelm 目前缺少可运行、可测试的 agent runtime 地基。模型决策、工具执行、trace 记录、上下文压缩还没有稳定协议，导致 observation 工具、审批流程、cockpit UI 以及后续产品能力无法安全推进。

当前痛点：
- `AgentDecision`、`ToolSpec`、`ToolResult`、`TraceEvent` 缺少统一运行时契约。
- 没有强制边界区分“完整工具结果（用于 trace）”和“压缩摘要（用于模型上下文）”。
- 缺少最小 HITL 协议表达（风险等级、approval-required 状态）。
- 缺少可回放 run metadata，难以定位 parser 失败和 schema 演进问题。

## 方案概述

构建一个可在 Node 环境测试的 v0.1 Agent Kernel，以 schema 驱动契约和 trace-first 可观测性为核心：

- 实现最小 loop runtime（`AgentLoop`、`StateMachine`、`StepRunner`、`RunController`）。
- 统一决策/工具/trace 协议到 `tool_call | ask_user | finish | fail`。
- 引入 `ContextBuilder` + `ContextCompactor`：完整工具结果进 trace，模型仅接收受限摘要。
- 仅实现 HITL 协议雏形：`ToolRisk`、`ApprovalRequest`、`approval_required` trace、`waiting_for_approval` 状态表达。
- 增加 run metadata 与模型输出 trace 记录，支撑回放与 parse 诊断。
- 通过测试与 dev script 验证，不在 v0.1 交付 React DevRunner。

## 范围

### 范围内
- v0.1 kernel runtime 契约与执行闭环。
- `ToolRegistry`/`ToolRouter` 与 mock 工具接入。
- 上下文压缩策略与限制参数。
- TraceEvent 契约与内存版 recorder 接口实现。
- Goal/Intent 预留字段（`goal`、`successCriteria`、`maxSteps`、turn `intent`），但不引入 planner 行为。
- 开发模式下 `.env` provider fallback（`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`）仅用于手工验证。

### 范围外
- 真实 DOM/content-script 工具。
- Cockpit UI、approval UI、RuntimePort 驱动的 UI 集成。
- 完整 approve/deny lifecycle 与 runtime hook 编排。
- planner、任务拆解、TaskClassifier、正式 ToolSelector 流程。
- memory、workflow replay、MCP、skill runtime、sub-agent/multi-agent 能力。

## 影响分析

| 组件 | 是否变更 | 说明 |
|-----------|-----------------|---------|
| Database | 否 | v0.1 仅使用 in-memory trace recorder，不涉及持久化库结构。 |
| API | 否 | 仅提供 OpenAI-compatible client 骨架，不新增后端 API。 |
| State | 是 | 引入 loop session/turn/control 与 approval-required 状态表达。 |
| UI | 否 | 本次明确不包含 React DevRunner/Cockpit UI。 |

## 架构考虑

- 保持核心边界：runtime core 可在 Node 下测试，不依赖 DOM/React/chrome API。
- 确立 trace-first 契约：完整结果用于可观测性，压缩结果用于上下文安全。
- 审批能力渐进落地：v0.1 只做协议标记，runtime/UI 编排后续版本完成。
- 提前引入回放元信息，降低后续 eval/replay 扩展的迁移成本。

## 成功标准

- [x] v0.1 mock run 能稳定完成 `tool_call -> tool_result -> finish/fail/ask_user`。
- [x] 在保留完整 trace payload 的同时，工具结果压缩能通过策略限制避免上下文溢出。
- [x] approval-required 能在协议/trace/state 中表达，但不实现完整审批生命周期。
- [x] goal/intent 预留字段存在且不会触发 planner 行为。
- [x] kernel 测试可在 Node/Vitest 中运行，不依赖 React/DOM/Chrome API。

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|-------------|--------|------------|
| 范围膨胀到 UI/runtime 集成 | 中 | 高 | 锁定 v0.1 仅含 kernel + tests + dev script。 |
| 摘要策略过宽导致上下文仍过大 | 中 | 高 | 强制 `ContextPolicy` 限制，并只允许 compactor 注入上下文。 |
| 多份 spec 契约漂移（run metadata/trace/goal） | 中 | 中 | 先统一 canonical 字段，再进入实现。 |
| trace 泄露敏感信息 | 低 | 高 | trace 写入前统一 masking，禁止 API key 落盘。 |
