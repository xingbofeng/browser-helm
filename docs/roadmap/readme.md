# Roadmap

每个 roadmap 文档都是一个版本级需求说明，并统一使用 10 个模块：

最终版本边界先看 `docs/roadmap/final-version-structure.md`。单版本文档负责展开细节；如果版本意图冲突，以最终总览为准。

1. 背景
2. 用户故事
3. 目标
4. 不做什么
5. 产品方案
6. 设计图 / 视觉参考
7. 技术方案
8. 目录结构
9. 依赖关系
10. 验收标准

任何模块都不能留空。如果不适用，写 `不适用`。

分支策略：默认使用 `main` 分支，roadmap 文档不再提供独立分支名模板。

第 8 节「目录结构」必须同时列出本版本涉及的生产代码目录和测试目录：

- `src/`：本版本新增或主要改动的 runtime、tool、UI、storage、schema 等目录。
- `tests/`：按 TDD 推进需要先落位的测试分层。优先按运行环境拆分为 `tests/node/`、`tests/dom/`、`tests/browser/`，避免 core、page、UI、extension 测试互相污染。

测试分层规则：

- `tests/node/`：core 逻辑测试，不启动 React、不启动浏览器、不加载扩展。
- `tests/dom/page/`：页面解析测试，使用 HTML fixtures，不调用真实 AgentLoop。
- `tests/dom/ui/`：UI 展示和交互测试，使用 FakeRuntimePort，不调用真实 AgentLoop、真实模型或真实 Chrome API。
- `tests/browser/extension/`：extension integration，允许 background/content/sidepanel 串起来。
- `tests/browser/e2e/`：真实浏览器用户路径。

上下文治理规则：

- v0.1 起就必须区分 full result 和 context summary。
- 完整 ToolResult、Observation、ref map、visible text、debug detail 写入 trace / storage。
- 模型上下文只接收 `ContextCompactor` 生成的摘要，并受 `ContextPolicy` 限制。
- v1.0 前不做 sub-agent / agent-as-tool / delegate_to_agent；角色分工先由 mode / task runner 承担。
- Memory + Workflow Replay 稳定后，才单独评估是否需要 sub-agent。

HITL / 人在环规则：

- HITL 从 v0.1 进入协议层：`ToolRisk`、approval schema、approval_required trace。
- v0.33 进入 runtime hook：高风险动作生成 ApprovalRequest，并暂停 run。
- v0.4 进入 UI：ApprovalDialog 展示 action preview、risk、reason、Approve/Deny。
- v1.0 成为正式安全能力：ToolRouter 执行前必须经过 PolicyEngine。
- Memory、Workflow、Skill、MCP、Sub-agent 都不能绕过 PolicyEngine。

产品化能力放置规则：

- v0.1 只放 versioning、raw model output trace、basic masking、step duration。
- v0.2 加 domain awareness 和 prompt injection HTML fixture。
- v0.4 展示细粒度 run state，并预留用户行为策略设置。
- v0.1 不做 planner，只预留 goal / successCriteria / current step intent / trace。
- v1.0 加 TaskClassifier、ToolSelector、RecoveryPolicy、Goal/SuccessCriteria、mode-based lightweight plan、Evidence/Confidence、Capability/Permission、Human-readable DebugReport。
- v1.0.1 将 v0.4 Cockpit 产品化为单 Agent side panel：真实 streaming、可恢复 AgentMessage、模型配置弹窗、精简 Debug，并删除不用的旧四 Tab UI 代码。
- v1.0.2 一次性补齐 v1.0 必须工具，并完成长页面 / iframe 读取闭环：page read、article read、iframe list/read、viewport get/scroll；用户任务必须接入真实 AgentLoop tool-calling，避免只基于一次 snapshot 摘要回答。
- v1.1.3 做 public release readiness：版本号、tag、GitHub Release、checksum、coverage/security/release CI、README 隐私声明和工具文档一致性。
- v1.2 加 trace replay seed、StepSummary、RunSummary、SessionSummary，并把成功 plan 沉淀成 workflow draft。
- v1.2 同时落地 per-domain permission/domain policy seed、MV3 session persistence，以及 Goal/SuccessCriteria 与 summary/workflow replay 的完成判断桥接。
- v1.3+ / v2.0 加 eval、prompt injection eval、skill、MCP、tool sandbox、agent-as-tool。
- v1.7 在 v1.2-v1.6 能力稳定后，集中做完整 Mode System / RuntimeStrategy 收敛，以及全面 tool summary/error/debug i18n hardening。

## v1.6 Release Readiness

v1.6 不能只因为版本号、工具常量、UI shell 或 roadmap 文档存在就标记为可发布。发布前必须同时满足：

- P0 安全阻断全部关闭：full mode approval invariant、execution-layer authorization、page mutation grounding、form action nonce、verifier finish gate、transactional approval coordinator、tool manifest allowlist。
- `docs/audits/v1-1-v1-6-completion-matrix.md` 存在，覆盖 v1.1-v1.6 每个 roadmap AC，并且没有 P0 open gate。
- `npm run check:release` 通过，包含 tool docs、release hygiene、manifest permissions 和 completion matrix gate。
- `npm run test:security` 通过，覆盖 P0 prompt injection、approval、token、redaction、page-health nonce、workflow precondition 和 adapter prompt exclusion 回归。
- `npm run test:coverage` 通过；coverage 先保持温和全局阈值，并对 authorization、approval coordinator、form action token、tool registry、workflow replay 和 redaction 等安全关键模块设置文件级阈值，后续再逐步提高全局阈值。
- `npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test`、`npm run build`、`npm run test:e2e` 均通过。
- real-model E2E 只在明确配置 provider credentials 时运行；未运行时必须在最终验证记录中说明。
