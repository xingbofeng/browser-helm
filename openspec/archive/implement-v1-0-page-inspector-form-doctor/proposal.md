## Why

BrowserHelm 已完成 v0.x 的 Agent loop、页面观察、Structured Page Data、Action Readiness 和 Cockpit UI，但还缺少第一个可发布产品闭环：用户能让 Agent 解释页面为什么异常、表单为什么不能提交，并看到证据、信心等级和可行动建议。

v1.0 需要按照 roadmap 完整落地 **Page Inspector / 页面检查员** 与 **Form Doctor / 表单医生**，同时把 Mode System、TaskClassifier、ToolSelector、RecoveryPolicy、Goal / Plan、Evidence / Confidence、DebugReport、Capability / Permission model 和 HITL / Policy / Approval Runtime 变成首发诊断体验的一部分。

## What Changes

- 实现 v1.0 **Mode System**：Ask / Debug / Form / Act，由规则优先的 TaskClassifier 选择 mode，并输出 reason 与 confidence。
- 实现 ToolSelector：根据 mode、task、page state、permission/capability 和 risk 动态裁剪模型可见工具；ToolRouter/runtime 仍执行前校验。
- 实现 v1.0 只读诊断工具闭环：form list/inspect/read、missing required、validation errors、disabled submit reason，以及浅层 page health summary。
- 实现 RecoveryPolicy：覆盖 REF_STALE、TOOL_ARGS_INVALID、ELEMENT_NOT_FOUND、PAGE_CHANGED、MODEL_OUTPUT_INVALID、MAX_STEPS_EXCEEDED 等恢复路径。
- 实现 Goal / SuccessCriteria 与 mode-based lightweight plan：PlanState 进入 trace，模型上下文只接收 plan progress summary。
- 实现 AgentFinding / Evidence / Confidence 与 human-readable DebugReport，Debug/Form 结论必须带证据和不确定性表达。
- 实现 runtime capability / permission model 的 v1.0 范围：activeTab、host permission、浅层 debug 可用性、tool risk、approval boundary。
- 正式化 HITL / Policy / Approval Runtime：高风险动作执行前必须被 runtime guard 阻断并进入 approval flow/audit；v1.0 approve 不自动执行 v1.1 的填写或提交动作。
- 扩展 Cockpit UI 承载 v1.0 诊断流程：mode reason、plan progress、findings/evidence、DebugReport、interrupt/revise goal 的最小展示。
- 明确版本边界：v1.0 不做表单自动填写、批量填写、verify、submit-with-approval、提交执行器、FormPanel、DebugPanel、TraceViewer detail、CDP deep inspector、memory/workflow、vision/screenshot 或 sub-agent。

## Capabilities

### New Capabilities

- `mode-system`: 定义 v1.0 完整 Mode System，包含 Ask / Debug / Form / Act 的分类、工具裁剪、prompt/context 策略和安全边界。
- `task-classifier`: 定义规则优先的 task -> mode 分类、reason、confidence 和低置信度处理。
- `tool-selector`: 定义 mode/task/state/permission/risk 驱动的动态工具选择与 deny-by-default 规则。
- `recovery-policy`: 定义错误码到恢复动作的映射、恢复预算、recovering 状态和失败收口。
- `goal-plan`: 定义 Goal / SuccessCriteria、mode-based lightweight plan、PlanState 和 PlanProgressSummary。
- `agent-findings`: 定义 AgentFinding、Evidence、Confidence 及 Debug/Form 结论证据规则。
- `debug-report`: 定义用户可读 DebugReport 的结构、输出时机、limitations 和 recommendations。
- `runtime-capabilities`: 定义 v1.0 capability / permission model，以及 ToolSelector / PolicyEngine 的可用性输入。
- `page-health-debug`: 定义只读浅层 page health summary，包括 console errors、network failures 和基础页面状态。

### Modified Capabilities

- `approval-runtime-hook`: 扩展为 v1.0 正式 HITL / Policy / Approval Runtime，要求执行前 policy guard、request lifecycle、audit trace 和 approve/deny 结果边界。
- `cockpit-ui`: 扩展 Cockpit UI 以承载 mode reason、plan progress、findings/evidence、DebugReport、interrupt/revise goal 的最小 v1.0 产品体验。
- `form-fields`: 扩展 Form Doctor 只读诊断要求，覆盖 missing required、validation errors、disabled submit reason 与 evidence/confidence 输出。
- `page-observation`: 扩展 Page Inspector 对只读 page health summary、DebugReport evidence 和浅层 debug signal 的消费要求。
- `run-mode-gate`: 保持 v0.x Run Mode Gate 的执行前门禁，并说明 v1.0 Mode System 在其上层进行 task classification 与动态 tool selection。

## Impact

- 影响 `src/agent/**`：新增或扩展 task classification、mode system、tool selection、recovery、goal/plan、findings/report 和 metrics。
- 影响 `src/tools/**`：新增/补强只读 form/debug tools，调整 tool contract、modes、risk 和 context visibility。
- 影响 `src/page/**`：新增/补强 form/debug/page health readers，保持 content script 不持有 provider key。
- 影响 `src/runtime/**` 与 `src/background/runtime/**`：扩展 RuntimePort、RunManager、ApprovalManager、RunSnapshot、runtime events、interrupt/revise goal 和 capability inputs。
- 影响 `src/shared/schemas/**`：新增/扩展 mode、classification、selector、recovery、goal/plan、finding/evidence/report、capability 和 page health schema。
- 影响 `src/ui/**`：复用 v0.4 Cockpit UI，增加 v1.0 诊断展示，不新增 FormPanel/DebugPanel/TraceViewer detail。
- 影响 `tests/node/**`、`tests/dom/**`、`tests/e2e/**`：覆盖 schema、policy、selector、form/debug readers、runtime flow、Cockpit 展示和 extension E2E。
- 影响 `CONTEXT.md`、`docs/roadmap/**`、`implementation-notes.md` 和 OpenSpec specs。
