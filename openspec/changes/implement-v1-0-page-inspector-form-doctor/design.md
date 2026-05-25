## Context

v0.x 已经建立了 BrowserHelm 的基础链路：Agent Kernel、ToolRouter、真实页面观察、Stable Ref、Structured Page Data、只读交互/表单数据、Action Readiness、Approval Runtime Hook 和 v0.4 Cockpit UI。当前系统能“看见页面”和“展示运行过程”，但 v1.0 首发产品还缺少完整诊断闭环：自动判断用户任务、只暴露合适工具、恢复常见失败、输出带证据和信心等级的用户可读报告。

现有 `Run Mode Gate` 是最小门禁；v1.0 的 **Mode System** 是上层产品与安全系统，负责 TaskClassifier、ToolSelector、prompt/context policy、recovery、goal/plan 和 report 之间的编排。`CONTEXT.md` 已确认 v1.0 的 Page Inspector / Form Doctor 默认只读诊断，Act mode 是动作准备和审批边界，不执行 v1.1 的填写或提交。

## Goals / Non-Goals

**Goals:**

- 按 roadmap 完整实现 v1.0 Page Inspector + Form Doctor。
- 建立规则优先的 TaskClassifier，输出 mode、reason 和 confidence。
- 建立 deny-by-default ToolSelector，使 prompt tool surface 与 runtime execution gate 都受 mode、task、state、permission 和 risk 约束。
- 建立只读 Form Doctor 与 Page Inspector 诊断闭环，输出 AgentFinding / Evidence / Confidence 和 DebugReport。
- 建立 RecoveryPolicy、Goal / SuccessCriteria、mode-based lightweight plan 和 plan progress summary。
- 正式化 capability / permission model 与 HITL / Policy / Approval Runtime。
- 复用 v0.4 Cockpit UI，用最小 UI 增量展示 mode reason、plan progress、findings/evidence、DebugReport 和 interrupt/revise goal。

**Non-Goals:**

- 不实现表单自动填写、批量填写、verify、submit-with-approval 或提交执行器；这些属于 v1.1。
- 不新增 FormPanel、DebugPanel、TraceViewer detail；v1.0 只扩展 Cockpit 现有区域。
- 不使用 `chrome.debugger` 或 CDP；v1.0 debug 只用浅层 page health summary。
- 不实现 memory、workflow replay、screenshot/vision、sub-agent、通用 planner agent、subtask graph 或正式 eval runner。

## Decisions

### 1. TaskClassifier 规则优先，模型最多辅助

v1.0 的 TaskClassifier 使用 deterministic-first 规则：表单/字段/必填/disabled/不能提交归 Form；console/network/报错/页面坏了归 Debug；点击/输入/提交/执行归 Act；普通解释/摘要归 Ask。分类结果包含 `mode`、`reason`、`confidence` 和匹配到的 signals。

替代方案是完全交给模型分类。放弃该方案，因为 mode 会影响工具暴露和安全边界，必须可测试、可解释、可回归。模型可用于低置信度任务的辅助说明，但 runtime 最终 mode 仍由可验证规则决定。

### 2. ToolSelector deny-by-default，并保留 ToolRouter 执行前校验

ToolSelector 基于 mode、task classification、page state、runtime capabilities、permission state、tool risk 和 approval policy 生成模型可见工具列表。默认不暴露当前任务不需要的工具；high-risk 工具默认隐藏，除非 Act mode 和 policy 明确允许进入审批边界。

prompt 隐藏不是安全边界。ToolRouter / RunManager 仍必须在执行前检查工具 mode、risk、capability 和 PolicyEngine 结果，防止模型输出或 UI 调用绕过 selector。

### 3. v1.0 Debug 是浅层 Page Health Summary

Page Inspector 读取页面 URL/title/state、console errors、runtime exceptions、network failures 和基础健康摘要。它不读取 request/response body，不 attach debugger，不做 performance waterfall 或 event listeners。

替代方案是提前实现 DevTools/CDP。放弃该方案，因为 roadmap 将 DebugPanel/TraceViewer 放到 v1.1，将 CDP deep tools 放到 v1.3；v1.0 只需要足够支撑用户可读诊断报告。

### 4. Form Doctor 保持只读

v1.0 的 Form Doctor 读取字段、required、disabled、invalid、validationMessage、sensitive、submit summary 和 disabled submit reason，并输出 evidence/confidence。它不写字段、不 verify submit、不执行 submit。

这让 v1.0 可以回答“为什么不能提交”，同时为 v1.1 的 fill/verify/submit-with-approval 留出安全边界。

### 5. Evidence / Confidence 是 Debug/Form 结论的硬约束

Debug/Form finding 必须携带 evidence。没有证据只能 `low`；推断性关联最多 `medium`；直接来自页面、表单、debug signal 或 tool result 的证据才可 `high`。DebugReport 只展示结构化 findings、recommendations 和 limitations，不把完整 ToolResult 重新注入模型上下文。

### 6. Goal / Plan 是 lightweight，不是 planner agent

v1.0 使用 mode template + task + observation summary 生成 PlanState。Ask / Debug / Form / Act 分别有默认步骤。PlanState 写入 trace/storage；模型上下文只接收 PlanProgressSummary。

Plan 是 guide，不是 prison：无表单、权限不足、REF_STALE、用户 interrupt 或 revise goal 时可以动态修改。v1.0 不做通用 planner agent，也不生成 subtask graph。

### 7. RecoveryPolicy 有预算，避免循环

RecoveryPolicy 将错误码映射到恢复动作：REF_STALE / PAGE_CHANGED -> re_observe；TOOL_ARGS_INVALID / MODEL_OUTPUT_INVALID -> repair 或 parser recovery；ELEMENT_NOT_FOUND -> find alternative ref；MAX_STEPS_EXCEEDED -> summarize progress and ask user/fail。每类自动恢复默认 1 次；再次失败进入 `waiting_for_user` 或 `failed`。

### 8. Approval Runtime 正式化，但 approve 不执行 v1.1 动作

v1.0 要求高风险工具执行前经过 PolicyEngine 和 ApprovalManager，创建 request、更新 run snapshot、写入 audit trace，并处理 approve/deny/unknown request。Approve 在 v1.0 只表示审批结果被记录，允许后续显式流程继续；不会自动执行填写或提交动作。Deny 返回 `USER_DENIED_APPROVAL` 或等价终止结果。

### 9. Cockpit UI 做最小承载

v1.0 复用 v0.4 Cockpit，不新增重型 panel。UI 增量包括：classification/mode reason、plan progress、finding list、evidence detail、DebugReport summary、limitations、interrupt/revise goal 控件和 recovery 状态展示。完整 FormPanel / DebugPanel / TraceViewer detail 留给 v1.1。

## Risks / Trade-offs

- [Risk] v1.0 横跨 agent、runtime、tools、UI 和 specs，容易变成大爆炸改动 → Mitigation: 按契约/schema、mode/selector、tools、findings/report、recovery/plan、runtime/UI、E2E 分阶段实现，每阶段保持测试通过。
- [Risk] 规则优先分类覆盖不足 → Mitigation: 分类输出 confidence；低置信度默认 Ask 或请求用户确认，不扩大工具面。
- [Risk] ToolSelector 与 ToolRouter policy 规则重复 → Mitigation: selector 负责可见性，router/runtime 负责执行安全；共享 tool contract、risk 和 capability 数据。
- [Risk] Debug shallow signals 不稳定或页面不可读 → Mitigation: page health reader 返回结构化 limitations，DebugReport 明确说明不可用原因。
- [Risk] 自动恢复循环 → Mitigation: RecoveryBudget 按 error/run 限制次数，超过预算进入 waiting_for_user 或 failed。
- [Risk] Evidence/DebugReport 被模型夸大 → Mitigation: report builder 只允许从 structured evidence 生成 confidence；缺 evidence 的结论必须降级或进入 limitations。

## Migration Plan

1. 新增 schema 与纯函数模块，不改变默认 runtime 行为。
2. 接入 TaskClassifier / ToolSelector 到 AgentLoop 和 RunManager，保持现有 explicit mode 输入兼容。
3. 接入只读 form/debug/page health tools，并更新 tool README。
4. 接入 findings/report/goal/plan/recovery 到 trace、context summary 和 Cockpit。
5. 扩展 RuntimePort、RunSnapshot、approval lifecycle、interrupt/revise goal。
6. 补齐 node/dom/e2e 和 Chrome for Testing SOP 验证。

回滚策略：若 v1.0 Mode System 出现阻断，可保留 existing Run Mode Gate 作为 fallback，让默认 Ask mode 和已有 Cockpit 继续工作；新增 tools 可按 mode/capability 暂时隐藏。

## Open Questions

- 是否需要在 v1.0 为低置信度 TaskClassification 提供显式“确认 mode”UI，还是只在 `waiting_for_user` 中表达？
- DebugReport 是否需要导出为 markdown/text 文件，还是 v1.0 只在 Cockpit 中展示？
