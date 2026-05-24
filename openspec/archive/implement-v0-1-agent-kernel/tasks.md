# 实施任务：实现 v0.1 Agent Kernel

**变更 ID：** `implement-v0-1-agent-kernel`

---

## 阶段 1：基础契约（Schema 与协议）

- [x] 1.1 定义并对齐 v0.1 核心 schema：`AgentDecision`、`ToolSpec`、`ToolResult`、`ApprovalRequest`、`RunMetadata`、`TraceEvent`。
- [x] 1.2 增加 Goal/Intent 预留字段契约：`AgentRunInput.goal/successCriteria/maxSteps`、`AgentStep.intent`。
- [x] 1.3 补充 parser/schema 单测：拒绝旧形态 `type: "tool"`，并覆盖 parse failure 路径。

**质量门禁：**
- [x] 静态检查通过
- [x] schema 与 parser 单测通过

---

## 阶段 2：核心运行时（Loop 与控制）

- [x] 2.1 实现 `AgentLoop`、`StateMachine`、`StepRunner`、`RunController`，覆盖 `maxSteps/cancel/pause/resume`。
- [x] 2.2 实现 `ContextBuilder`、`ContextCompactor`、`ContextPolicy`，确保上下文受限且可压缩。
- [x] 2.3 实现模型输出与解析失败 trace 记录（`rawText`、`parseError`、版本元信息）。

**质量门禁：**
- [x] 静态检查通过
- [x] 核心状态流转测试通过

---

## 阶段 3：工具层与 HITL 协议雏形

- [x] 3.1 实现完整 `ToolSpec` 形态下的 `ToolRegistry` 与 `ToolRouter`。
- [x] 3.2 接入 mock 工具（`bh_agent_finish`、`bh_agent_fail`、`bh_agent_ask_user`、`bh_mock_page_observe`）。
- [x] 3.3 实现最小 HITL 协议：`ToolRisk`、`requiresApproval`、`approval_required` trace、`waiting_for_approval` 状态表达。

**质量门禁：**
- [x] 静态检查通过
- [x] tool 路由与 approval-required 协议测试通过

---

## 阶段 4：Trace 与开发验证

- [x] 4.1 实现 `TraceRecorder` 接口与 `InMemoryTraceRecorder`。
- [x] 4.2 实现 trace 写入前 masking，确保敏感信息不会落盘。
- [x] 4.3 提供 dev 脚本 `scripts/run-agent-dev.ts`，支持 `.env` fallback（仅本地手动验证）。
- [x] 4.4 验证 Node-only 测试运行，不依赖 React/DOM/Chrome API。
- [x] 4.5 核对改动目录边界；若超出 v0.1 目录结构，补充偏离说明。
- [x] 4.6 核对“设计图不适用”结论，不新增任何设计图验收工作。
- [x] 4.7 核对 `lint/tsconfig` 现有行为不受影响。

**偏离说明（AC16）：**
- 为保障 Node-only 测试与类型检查稳定，额外改动了 `package.json`（测试脚本与 dev 脚本）、`tsconfig.json`（tests/scripts 纳入编译）、`eslint.config.js`（保持 lint 与新增测试兼容）、`wxt.config.ts` 与 `src/wxt-globals.d.ts`（WXT 入口类型兼容）。
- 以上偏离均为 v0.1 质量门禁所需的最小工程化改动，不引入 UI/DOM/content-script runtime 行为。

**质量门禁：**
- [x] 所有测试通过
- [x] 静态检查通过
- [x] 文档与 spec 同步完成

---

## 验收标准覆盖矩阵（AC1-AC17）

- [x] AC1（mock run 可完成 finish/fail/ask_user）覆盖：`2.1`、`3.2`
- [x] AC2（非法决策与旧 `type: "tool"` 触发 parse failure + trace）覆盖：`1.3`、`2.3`
- [x] AC3（tool 不存在/args 非法时 trace 包含 tool name、error code、retryable）覆盖：`3.1`、`2.3`
- [x] AC4（新增 mock tool 仅需注册 ToolSpec）覆盖：`3.1`、`3.2`
- [x] AC5（LoopSession/RunController 的 maxSteps/cancel/pause/resume）覆盖：`2.1`
- [x] AC6（risk + requiresApproval + waiting_for_approval + approval_required）覆盖：`3.3`
- [x] AC7（parse 失败 trace 含 raw output + parse error + 版本元信息）覆盖：`2.3`、`4.2`
- [x] AC8（step startedAt/endedAt/durationMs + TraceEvent timestamp）覆盖：`1.1`、`2.1`、`4.1`
- [x] AC9（预留 goal/successCriteria/maxSteps/intent，且不生成 plan）覆盖：`1.2`、`2.1`
- [x] AC10（完整 ToolResult 入 trace，模型上下文仅压缩摘要）覆盖：`2.1`、`2.2`、`4.1`
- [x] AC11（ContextCompactor 默认最近 3 steps + chars 限制）覆盖：`2.2`
- [x] AC12（v0.1 不含 planner/任务拆解/sub-agent 决策类型）覆盖：`1.1`、`2.1`
- [x] AC13（Node/Vitest 可运行且不依赖 React/DOM/Chrome）覆盖：`4.4`
- [x] AC14（不做 React DevRunner，dev script 支持 `.env` fallback）覆盖：`4.3`
- [x] AC15（lint/tsconfig 现有行为不受影响）覆盖：`4.7`
- [x] AC16（改动目录边界受控，超出需偏离说明）覆盖：`4.5`
- [x] AC17（设计图验收不适用）覆盖：`4.6`

---

## 完成清单

- [x] 所有阶段完成
- [x] 所有质量门禁通过
- [x] 验收标准覆盖矩阵全部打勾
- [x] 文档同步完成
- [x] 准备执行 `/openspec-archive`
