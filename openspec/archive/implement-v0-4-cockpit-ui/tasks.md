## 1. 依赖与结构

- [x] 1.1 将 `lucide-react` 加入依赖，并记录引入必要性。
- [x] 1.2 建立 `src/ui/sidepanel/`、`src/ui/components/`、`src/ui/approval/`、`src/ui/stores/`、`src/ui/lib/`、`src/ui/styles/` 目录骨架。
- [x] 1.3 将 `src/entrypoints/sidepanel/app.tsx` 收敛为 entrypoint/wrapper，不再承载主体 Cockpit UI。
- [x] 1.4 建立 UI import boundary 测试，禁止 `src/ui/**` 直接 import AgentLoop、ToolRouter、ModelClient 或 content script 内部模块。

## 2. RuntimePort 与 FakeRuntime

- [x] 2.1 为 FakeRuntimePort 编写测试，覆盖 startRun、cancelRun、getRunSnapshot、subscribeRun、approval decision 和 settings 场景。
- [x] 2.2 实现 FakeRuntimePort 和 UI 测试 helper，支持 deterministic run snapshots、trace events、pending approval 和 provider settings。
- [x] 2.3 为 ExtensionRuntimePort cancelRun 编写 node/runtime 测试，证明 Stop 不再是 no-op。
- [x] 2.4 扩展 runtime message schema，加入 cancelRun 请求和 cancelled snapshot/status。
- [x] 2.5 在 background RunManager / runtime host 中实现 cancelRun，取消后不得继续执行后续工具。
- [x] 2.6 为 RuntimePort approval decision 路径补齐测试，覆盖 approve、deny、未知 request 和错误展示。
- [x] 2.7 若 subscribeRun 真实事件流未完整可用，实现 snapshot refresh fallback，并用测试覆盖。

## 3. UI Stores 与格式化工具

- [x] 3.1 为 agent/run store 编写测试，覆盖 run state、mode、busy/error、selected step 和 cancellation。
- [x] 3.2 实现 agent/run store。
- [x] 3.3 为 page-data store 编写测试，覆盖 observation/ref/interactive/forms ready、empty、unsupported、error 状态。
- [x] 3.4 实现 page-data store。
- [x] 3.5 为 trace store 编写测试，覆盖 event grouping、selected event、tool result detail 和 approval events。
- [x] 3.6 实现 trace store 和 timeline grouping helpers。
- [x] 3.7 为 approval store 编写测试，覆盖 pending request、approve/deny loading、decision error 和 drawer close 边界。
- [x] 3.8 实现 approval store。
- [x] 3.9 为 settings store 编写测试，覆盖 provider settings 读取、保存、mask preview 和策略预留状态。
- [x] 3.10 实现 settings store，并复用既有 storage/runtime 边界。
- [x] 3.11 为 `format-tool`、`format-observation`、`risk-labels` 和 masking helpers 编写测试。
- [x] 3.12 实现 UI 格式化与 masking helpers，确保 API key 和敏感 args 不明文展示。

## 4. Cockpit Shell 与核心组件

- [x] 4.1 为 CockpitShell 编写 DOM UI 测试，覆盖窄宽度布局、滚动和主要区域可见性。
- [x] 4.2 实现 CockpitShell、基础主题和 responsive side panel layout。
- [x] 4.3 为 RunStateBadge 编写测试，覆盖 idle、starting、observing、thinking、executing_tool、waiting_for_approval、waiting_for_user、recovering、finished、failed、cancelled。
- [x] 4.4 实现 RunStateBadge。
- [x] 4.5 为 ChatPanel / RunControls 编写测试，覆盖任务输入、Run Mode 选择、Start、Stop 和 busy/disabled 状态。
- [x] 4.6 实现 ChatPanel 和 RunControls，使用 lucide 图标且文本不溢出。
- [x] 4.7 为 RuntimeProvider / CockpitApp 编写测试，覆盖 FakeRuntimePort 驱动的 startRun、snapshot 更新和 error 状态。
- [x] 4.8 实现 RuntimeProvider、CockpitApp 和 entrypoint 接入。

## 5. 四个 Tab Data 视图

- [x] 5.1 为 PageObservationTab 编写测试，覆盖 URL、title、domain、visible text summary、page state、warnings、empty/error。
- [x] 5.2 实现 PageObservationTab。
- [x] 5.3 为 RefMapTab 编写测试，覆盖 refId、role、name、tag、visible、disabled、搜索和空状态。
- [x] 5.4 实现 RefMapTab。
- [x] 5.5 为 InteractiveElementsTab 编写测试，覆盖 role/name/state、checked/selected、filter/search 和 unsupported 状态。
- [x] 5.6 实现 InteractiveElementsTab。
- [x] 5.7 为 FormFieldsTab 编写测试，覆盖字段 label、required、disabled、invalid、sensitive mask、submit summary、disabled submit reason。
- [x] 5.8 实现 FormFieldsTab。
- [x] 5.9 为核心 tab keyboard navigation / aria label 编写最小可访问性测试。
- [x] 5.10 实现 tab navigation 和基础 a11y 标注。

## 6. Timeline、Inspector 与 Trace

- [x] 6.1 为 StepTimeline 编写测试，覆盖 run started、observation、tool call、tool result、approval、error、terminal event。
- [x] 6.2 实现 StepTimeline 和 StepTimelineItem。
- [x] 6.3 为 ToolInspector 编写测试，覆盖 tool name、args preview、result code、summary、changedPage、requiresObserve、requiresApproval。
- [x] 6.4 实现 ToolInspector、ToolArgsView 和 ToolResultView。
- [x] 6.5 为 TraceLog / selected event detail 编写测试，覆盖完整 trace 展示但不提供 replay。
- [x] 6.6 实现 TraceLog 或等价 trace detail 区域。
- [x] 6.7 编写测试确保完整 ToolResult / Trace 展示不会改变 Agent context summary 行为。

## 7. Approval UI

- [x] 7.1 为 ApprovalRiskBadge 编写测试，覆盖 safe、low、medium、high 的文案和样式状态。
- [x] 7.2 实现 ApprovalRiskBadge。
- [x] 7.3 为 ApprovalCard / ApprovalDrawer 编写测试，覆盖 action preview、tool、risk、reason、args preview 和 masked sensitive values。
- [x] 7.4 实现 ApprovalCard 和 ApprovalDrawer。
- [x] 7.5 为 Approve / Deny 交互编写测试，覆盖 decision loading、成功 event、USER_DENIED_APPROVAL 和未知 request 错误。
- [x] 7.6 实现 Approval UI 与 RuntimePort decision 路径。
- [x] 7.7 编写测试确保 Approval UI 不展示 submit-with-approval、`iframe_submit` 或完整 action executor 的虚假能力。

## 8. Settings UI

- [x] 8.1 为 SettingsPanel 编写测试，覆盖 apiKey、baseUrl、model 输入、保存和重新读取。
- [x] 8.2 实现 SettingsPanel。
- [x] 8.3 为 API key masking 编写测试，确保保存后 UI、timeline、trace、ToolInspector 不出现明文 key。
- [x] 8.4 实现 API key password/masked 输入和 masked preview。
- [x] 8.5 为用户行为策略预留 UI 编写测试，覆盖默认只读、提交前确认、domain 禁用、debug/network 读取开关的可见性。
- [x] 8.6 实现策略预留 UI，并明确未接入 runtime enforcement 的状态。

## 9. E2E 与真实浏览器验收

- [x] 9.1 设计 v0.4 E2E flow，保持 spec / flow / page / component object 分层，不在 spec 中直接写复杂 locator。
- [x] 9.2 新增 E2E 覆盖 Cockpit 四个 tab 展示、Run Mode start、Stop cancellation、approval drawer 和 settings masking。
- [x] 9.3 运行并修复 `npm run test:e2e` 中与 v0.4 相关的 POM 回归。
- [x] 9.4 按 Chrome for Testing debug SOP 补充验收 E2E 难以覆盖的原生 side panel 宿主场景：窄宽度、滚动、resize、approval drawer 可用性和 settings masking。
- [x] 9.5 若 SOP 验收发现 UI 与 E2E 行为不一致，优先补自动化测试或记录明确环境差异。

## 10. 文档、验证与收口

- [x] 10.1 更新 `CONTEXT.md` 中与 v0.4 相关的领域术语，仅保留产品语言，不记录实现细节。
- [x] 10.2 更新 roadmap 或 implementation notes，记录 lucide 依赖、组件拆分、真实浏览器验收边界和不写 ADR 的决策。
- [x] 10.3 运行 `npm run typecheck`。
- [x] 10.4 运行 `npm run lint`。
- [x] 10.5 运行相关 Vitest：runtime、stores、UI components、approval、settings。
- [x] 10.6 运行 `npm run build`。
- [x] 10.7 运行 `npm run test:e2e`。
- [x] 10.8 运行 `npx openspec validate implement-v0-4-cockpit-ui --strict`。
- [x] 10.9 最终复查是否存在可以删除的冗余 UI 状态、未使用变量或无需求驱动抽象。
