## Why

v0.2 到 v0.33 已经具备页面观察、Ref 映射、交互元素、表单字段、Action Readiness 和 approval runtime hook，但用户仍缺少一个透明、可控、可审计的 **Cockpit UI / 驾驶舱 UI**。v0.4 需要把这些能力收束到 extension side panel，作为 v1.0 Page Inspector / Form Doctor 的产品外壳。

## What Changes

- 将现有 side panel 原型演进为 v0.4 Cockpit UI Prototype，`app.tsx` 只保留 entrypoint/wrapper，主体 UI 拆到 `src/ui/**`。
- 实现页面观察、Ref 映射、交互元素、表单字段四个核心 Tab Data 视图。
- 实现 ChatPanel、Run Mode 选择、Run / Stop 控制、RunStateBadge、StepTimeline、ToolInspector 和 Trace detail。
- 实现基础 Approval UI，使用 drawer 展示 action preview、risk、reason、args preview，并支持 Approve / Deny。
- 实现 Settings UI，保存 `apiKey`、`baseUrl`、`model`，并预留用户行为策略设置；API key 必须 mask，不能进入 trace 或工具结果展示。
- 使用 `RuntimePort` 作为 UI 与 runtime 边界；UI 不直接调用 AgentLoop、ToolRouter、ModelClient 或 content script。
- 引入 `lucide-react` 作为 v0.4 UI 图标库。
- 补齐真实 `cancelRun` runtime message，使 Stop 能让 run 进入 `cancelled` 或等价终止状态。
- UI 单测使用 FakeRuntimePort；E2E 必须遵循现有 POM 分层；真实 Chrome for Testing SOP 只补充验收 E2E 难以覆盖的 side panel 宿主场景。

## Capabilities

### New Capabilities

- `cockpit-ui`: 定义 v0.4 驾驶舱 UI 的 side panel shell、核心 Tab Data 视图、run 控制、timeline、tool inspector、trace detail 和组件化边界。
- `cockpit-approval-ui`: 定义基础 approval drawer、Approve / Deny 交互、approval event 展示和敏感参数遮蔽要求。
- `cockpit-settings`: 定义 provider settings UI、存储边界、API key masking 和用户行为策略预留。

### Modified Capabilities

- `page-observation`: 扩展真实浏览器验收要求，明确 v0.4 E2E 仍遵循 POM，Chrome for Testing SOP 只补充 E2E 无法稳定覆盖的 UI/宿主场景。
- `run-mode-gate`: 扩展 Cockpit UI 中 run mode 选择、状态展示和 Act mode 文案边界。
- `approval-runtime-hook`: 扩展 v0.4 UI 对 ApprovalRequest / ApprovalDecision 的消费要求，不扩大 v0.33 动作执行范围。
- `agent-kernel`: 扩展 run cancellation 的用户可见契约，支持 Stop 控制进入 `cancelled` 或等价终止状态。

## Impact

- 影响 `src/entrypoints/sidepanel/`：现有入口变薄，接入新的 Cockpit UI。
- 新增/影响 `src/ui/sidepanel/`、`src/ui/components/`、`src/ui/approval/`、`src/ui/stores/`、`src/ui/lib/`、`src/ui/styles/`。
- 影响 `src/runtime/`、`src/background/runtime/` 和 runtime messages：补齐 cancel、approval decision、snapshot/trace UI 消费边界。
- 影响 `src/storage/`：复用既有 settings store，不让 UI 直接散写 chrome.storage key。
- 新增依赖 `lucide-react`。
- 测试影响包括 `tests/dom/ui/**`、`tests/node/runtime/**`、`tests/e2e/**`，以及 Chrome for Testing SOP 补充验收记录。

---

## Archive Information

**Archived:** 2026-05-25 16:40
**Duration:** 1 day
**Outcome:** Successfully implemented

### Files Modified
- `src/entrypoints/sidepanel/app.tsx`
- `src/ui/**`
- `src/runtime/**`
- `src/background/runtime/**`
- `src/storage/**`
- `tests/node/**`
- `tests/dom/**`
- `tests/e2e/**`
- `openspec/specs/**`

### Specs Updated
- `openspec/specs/agent-kernel/spec.md`
- `openspec/specs/approval-runtime-hook/spec.md`
- `openspec/specs/cockpit-approval-ui/spec.md`
- `openspec/specs/cockpit-settings/spec.md`
- `openspec/specs/cockpit-ui/spec.md`
- `openspec/specs/page-observation/spec.md`
- `openspec/specs/run-mode-gate/spec.md`

### Verification
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npx openspec validate implement-v0-4-cockpit-ui --strict`
- `npx openspec validate --all --strict`
