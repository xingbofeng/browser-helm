## 1. 契约与目录结构

- [x] 1.1 新增 v1.0 shared schemas：task classification、tool selection、recovery、goal/plan、finding/evidence/report、runtime capabilities、page health。
- [x] 1.2 为新增 schemas 编写 node 单测，覆盖成功、失败、默认值和敏感字段边界。
- [x] 1.3 建立 `src/agent/task/`、`src/agent/modes/`、`src/agent/recovery/`、`src/agent/goal/`、`src/agent/planning/`、`src/agent/report/`、`src/runtime/capabilities/` 目录。
- [x] 1.4 更新 `src/shared/schemas/run-state.schema.ts`、trace schema 或 runtime event 类型，承载 classification、plan、recovery、findings、DebugReport 和 capability limitations。
- [x] 1.5 更新文档与工具清单中 v1.0 术语，确保 Page Inspector / Form Doctor / Act 边界一致。

## 2. TaskClassifier 与 Mode System

- [x] 2.1 为 TaskClassifier 编写测试，覆盖 Ask、Debug、Form、Act、低置信度和中英文关键词。
- [x] 2.2 实现规则优先 TaskClassifier，输出 mode、reason、confidence 和 matchedSignals。
- [x] 2.3 为 Mode System 编写测试，覆盖显式 mode 兼容、默认 mode、mode reason 和 Act 不执行 v1.1 动作。
- [x] 2.4 实现 Mode System 组合入口，接入 AgentRunInput 与 run metadata。
- [x] 2.5 更新 prompt/context 构建，注入 mode reason 和分类摘要，但不扩大模型可见工具面。

## 3. ToolSelector 与 Runtime Capability

- [x] 3.1 为 RuntimeCapability model 编写测试，覆盖 activeTab、host permission、浅层 debug 可用性、tool risk、approval boundary 和 CDP reserved。
- [x] 3.2 实现 runtime capability 计算与 limitation 表达。
- [x] 3.3 为 ToolSelector 编写测试，覆盖 mode/task/state/permission/risk deny-by-default 行为。
- [x] 3.4 实现 ToolSelector，并复用 ToolSpec modes、risk、approval policy 和 capability metadata。
- [x] 3.5 将 ToolSelector 接入 AgentLoop context tool surface，同时保留 ToolRouter / RunManager 执行前校验。
- [x] 3.6 补充测试证明未暴露工具仍不能被模型或 UI 绕过执行。

## 4. Form Doctor 只读诊断

- [x] 4.1 补强 form-reader / validation-reader / submit state reader 测试，覆盖 missing required、validation errors、disabled submit reason、sensitive value preview 和 empty state。
- [x] 4.2 实现或补齐只读 form tools：list、inspect、read fields、find missing required、find validation errors、find disabled submit reason。
- [x] 4.3 为 form tools 补齐 ToolSpec TSDoc/JSDoc、modes、risk、args/result schema、context visibility 和 README 表格。
- [x] 4.4 为 Form Doctor findings 编写测试，确保 missing required、validation errors、disabled submit reason 带 evidence/confidence。
- [x] 4.5 确保 v1.0 Form Doctor 不注册 fill、verify、submit-with-approval 或提交执行器。

## 5. Page Inspector 与 Page Health Debug

- [x] 5.1 为 page health reader 编写 DOM/runtime 测试，覆盖 console errors、runtime exceptions、network failures、基础页面状态和 unavailable limitations。
- [x] 5.2 实现只读 page health summary，不使用 chrome.debugger 或 CDP。
- [x] 5.3 新增 debug tools：collect page health、get console errors、get network failures 或等价最小工具集合。
- [x] 5.4 为 debug tools 补齐 ToolSpec TSDoc/JSDoc、modes、risk、args/result schema、context visibility 和 README 表格。
- [x] 5.5 确保 debug signal 不可用不会自动阻断 form diagnosis，并把 limitation 写入 report。

## 6. Evidence、Findings 与 DebugReport

- [x] 6.1 为 Evidence / AgentFinding / Confidence builder 编写测试，覆盖 direct evidence、inferred evidence、missing evidence 和 confidence 降级。
- [x] 6.2 实现 findings builder，将 observation、form、debug 和 tool result 转成 AgentFinding。
- [x] 6.3 为 DebugReport builder 编写测试，覆盖 findings、recommendations、limitations、empty healthy state 和 partial-read state。
- [x] 6.4 实现 DebugReport builder，确保完整 ToolResult 留在 trace，模型上下文只接收摘要。
- [x] 6.5 更新 Agent terminal decision / finish 路径，使 Debug/Form run 输出 DebugReport。

## 7. Goal、SuccessCriteria 与 Lightweight Plan

- [x] 7.1 为 GoalState 和默认 successCriteria 派生编写测试，覆盖 Ask、Debug、Form、Act。
- [x] 7.2 实现 Goal / SuccessCriteria 初始化、满足状态记录和 finish 判断引用。
- [x] 7.3 为 PlanBuilder 编写测试，覆盖 mode templates、PlanState、PlanProgressSummary 和动态修改。
- [x] 7.4 实现 mode-based lightweight plan，完整 PlanState 入 trace，模型上下文只注入 progress summary。
- [x] 7.5 接入无表单、权限不足、REF_STALE、interrupt/revise goal 时的 plan update。

## 8. RecoveryPolicy

- [x] 8.1 为 RecoveryPolicy 编写测试，覆盖 REF_STALE、PAGE_CHANGED、TOOL_ARGS_INVALID、ELEMENT_NOT_FOUND、MODEL_OUTPUT_INVALID、MAX_STEPS_EXCEEDED。
- [x] 8.2 实现 RecoveryPolicy 和 RecoveryBudget，默认同类错误自动恢复 1 次。
- [x] 8.3 接入 AgentLoop / RunManager，使可恢复错误进入 recovering 状态并写 trace。
- [x] 8.4 补充测试证明恢复预算耗尽后进入 waiting_for_user 或 failed，并输出 limitation。

## 9. Approval Runtime 正式化

- [x] 9.1 为 PolicyEngine / ApprovalManager / RunManager lifecycle 编写测试，覆盖 requested、approved、denied、unknown request 和 audit trace。
- [x] 9.2 确保任意工具执行前先评估 risk、readiness、capability 和 policy。
- [x] 9.3 确保 high-risk 工具不进入 execute，而是先创建 approval request 或返回 approval required。
- [x] 9.4 确保 v1.0 approve 只记录决策，不自动执行 fill、verify、submit 或 v1.1 动作。
- [x] 9.5 确保 deny 返回 USER_DENIED_APPROVAL 或等价终止结果，并进入 DebugReport / timeline。

## 10. RuntimePort 与 Cockpit UI

- [x] 10.1 扩展 RuntimePort / FakeRuntimePort 测试，覆盖 classification、capabilities、plan、recovery、findings、DebugReport、interrupt 和 revise goal。
- [x] 10.2 实现 RuntimePort message schema 与 RunSnapshot 扩展。
- [x] 10.3 为 Cockpit UI 编写 DOM 测试，覆盖 mode reason、plan progress、findings/evidence、confidence、DebugReport、limitations、interrupt/revise goal。
- [x] 10.4 实现 Cockpit 最小 UI 增量，不新增 FormPanel、DebugPanel 或 TraceViewer detail。
- [x] 10.5 更新 E2E POM，保持 specs / flows / pages / components 分层。

## 11. AgentLoop 集成

- [x] 11.1 将 TaskClassifier、Mode System、ToolSelector、Goal/Plan、RecoveryPolicy、Findings/DebugReport 接入 AgentLoop。
- [x] 11.2 将 classification、selected tools、plan update、recovery action、findings 和 report 写入 trace。
- [x] 11.3 更新 ContextBuilder / ContextPolicy，使模型只接收 mode reason、selected tool contracts、plan progress 和 report summary。
- [x] 11.4 更新 system prompt，明确 v1.0 默认先诊断、Act 只做动作准备、填写提交属于 v1.1。
- [x] 11.5 补充 agent regression 测试，覆盖 Ask/Debug/Form/Act 主路径和失败路径。

## 12. E2E 与真实扩展验证

- [x] 12.1 新增或更新 fixtures：console/network errors、invalid form、disabled submit、no form、prompt injection、ref stale。
- [x] 12.2 新增 E2E 覆盖 TaskClassifier mode reason、Form Doctor findings、Page Inspector page health、RecoveryPolicy re-observe、DebugReport 展示。
- [x] 12.3 新增 E2E 覆盖 high-risk Act 被 approval boundary 阻断，不执行填写或提交。
- [x] 12.4 按 Chrome for Testing SOP 验证真实 side panel 中 mode reason、plan progress、findings/report、approval drawer 和 interrupt/revise goal。

## 13. 文档、验证与收口

- [x] 13.1 更新 `CONTEXT.md`、`docs/roadmap/**`、`docs/tools.md`、`implementation-notes.md`，记录 v1.0 边界和关键设计决策。
- [x] 13.2 运行 `npx openspec validate implement-v1-0-page-inspector-form-doctor --strict`。
- [x] 13.3 运行 `npm run typecheck`。
- [x] 13.4 运行 `npm run lint`。
- [x] 13.5 运行 `npm test`。
- [x] 13.6 运行 `npm run build`。
- [x] 13.7 运行 `npm run test:e2e`。
- [x] 13.8 最终复查是否存在冗余代码、未使用变量、无需求驱动抽象或 v1.1/v1.3 偷跑能力。
