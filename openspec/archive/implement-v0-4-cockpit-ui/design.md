## Context

BrowserHelm 现有 side panel 已能发起观察、展示 v0.2-v0.33 的最小页面数据，并支持 Run Mode 选择和 `waiting_for_approval` 的基础文案。但当前 UI 仍集中在 `src/entrypoints/sidepanel/app.tsx`，缺少可维护的组件边界、UI stores、timeline/inspector/settings/approval 结构，也没有真实 Stop runtime 行为。

v0.4 的核心是把 side panel 从“页面观察原型”演进为 **Cockpit UI / 驾驶舱 UI**。它不新增完整动作体系，也不把 UI 直接接到 AgentLoop 或 ToolRouter；它只通过 `RuntimePort` 消费 runtime snapshot、trace、approval request 和 settings。

## Goals / Non-Goals

**Goals:**

- 建立 v0.4 Cockpit UI Prototype，支持窄 side panel 优先布局。
- 把 `app.tsx` 变成 entrypoint/wrapper，主体拆为 `src/ui/**` 的组件、stores、lib 和 styles。
- 展示四类 Tab Data：页面观察、Ref 映射、交互元素、表单字段。
- 展示 run state、run mode、timeline、tool result、trace detail 和 selected step inspector。
- 提供基础 approval drawer，支持 Approve / Deny，并展示 action preview、risk、reason 和 args preview。
- 提供 Settings UI 保存 provider 配置，并保证 API key 只以 masked 形式进入 UI 状态和展示面。
- 补齐 Stop / cancel runtime message，避免 `RuntimePort.cancelRun` 继续是 no-op。
- 使用 FakeRuntimePort 驱动 UI 单测；E2E 继续遵循 POM；真实浏览器 SOP 只补充验收 E2E 难覆盖的 side panel 宿主行为。

**Non-Goals:**

- 不做自动填写、submit-with-approval、`iframe_submit` 或普通页面完整 action executor。
- 不做完整 Form Doctor / Debug Panel / MemoryViewer / VisionPanel / DevTools deep panel。
- 不做 trace replay、workflow replay 或桌面工作台布局。
- 不要求 approve 后新增自动执行原高风险动作的语义；沿用 v0.33 approval runtime hook。
- 不让 UI import `src/agent/kernel`、`src/tools/core`、`src/agent/model` 或 content script 内部实现。

## Decisions

### 1. 渐进替换现有 side panel，而不是推倒重写

保留现有 extension entrypoint、target tab resolve、settle refresh 和 runtime messaging 经验，把 UI 主体迁到 `src/ui/**`。`src/entrypoints/sidepanel/app.tsx` 最终只负责创建 `ExtensionRuntimePort`、挂载 provider 和少量 extension 宿主 glue。

备选方案是一次性重写整个 side panel。放弃该方案，因为 v0.2-v0.33 已经积累了真实 Chrome for Testing 调试路径和 iframe settle refresh 经验，重写容易破坏现有链路。

### 2. 窄 side panel 优先，Inspector 使用折叠区或 drawer

v0.4 roadmap 中的“左侧任务流、右侧上下文”在真实 Chrome side panel 宽度下不可直接照搬。实现采用单列主流程：顶部任务输入和状态，中部 Tab Data，底部或抽屉展示 timeline/inspector/settings/approval。

备选方案是桌面双栏布局。放弃该方案，因为 v0.4 是 extension side panel 产品，不是 desktop workbench。

### 3. `RuntimePort` 是唯一 UI-runtime 边界

Cockpit UI 只依赖 `RuntimePort`、shared schema 和 UI helpers。真实环境使用 `ExtensionRuntimePort`，测试和 story-like 场景使用 `FakeRuntimePort`。UI 不直接调用 AgentLoop、ToolRouter、ModelClient 或 content RPC。

备选方案是在 UI 组件中直接发 chrome runtime message。放弃该方案，因为这会让 UI 单测依赖 Chrome API，也会绕过 runtime snapshot 和 trace 边界。

### 4. UI store 按产品状态拆分，但避免过度细分

最低保留 `agent-store`、`page-data-store`、`trace-store`、`approval-store` 和 `settings-store`。`selected-step` 可以作为 trace/agent store 的字段，不强制单独建 store。

备选方案是每个组件持有本地 state。放弃该方案，因为 timeline、inspector、approval drawer 和 settings 需要共享状态，组件本地 state 会导致状态同步分散。

### 5. Approval 使用 drawer，而不是 modal

Approval drawer 在窄 side panel 中更适合保留上下文，并能展示 action preview、risk、reason、tool、args preview、Approve / Deny。drawer 必须阻止误触，但不遮蔽所有上下文。

备选方案是 modal。放弃该方案，因为 modal 在窄 side panel 中容易截断内容，并且会让用户看不到 timeline/target context。

### 6. Settings 复用 storage 边界，API key 默认 masked

Settings UI 通过 runtime/storage 边界保存 provider settings，不直接散写 chrome.storage key。API key 输入使用 password/masked 控件，保存后展示 masked preview；trace、timeline、tool result 和 runtime metadata 不得显示明文 key。

备选方案是在 UI 中直接操作 chrome.storage。放弃该方案，因为 provider config 是安全边界，已有 `settings-store` 和 provider boundary 测试。

### 7. 引入 `lucide-react` 作为 UI 图标库

v0.4 的 Cockpit UI 有状态、运行控制、tabs、settings、approval 等密集控件，需要一致的图标语言。引入 `lucide-react`，并限制为 UI 层使用。

备选方案是不用图标或手写 SVG。放弃该方案，因为 v0.4 是完整 Cockpit UI，图标能降低按钮文本拥挤；手写 SVG 会增加维护成本。

### 8. E2E 用 POM，真实浏览器 SOP 只补充自动化覆盖缺口

新增 E2E 必须继续按 `tests/e2e/specs`、`tests/e2e/flows`、`tests/e2e/pages`、`tests/e2e/components` 分层。真实 Chrome for Testing SOP 用于补充 E2E 不稳定或不能覆盖的宿主行为，例如原生 side panel 尺寸、滚动、resize、approval drawer 在真实容器中的可用性和 settings masking。

备选方案是把所有 UI 验收都放到手工浏览器检查。放弃该方案，因为 v0.4 的主体行为应可自动回归，手工/SOP 只用于宿主差异。

## Risks / Trade-offs

- [Risk] UI 拆分过大导致实现周期膨胀 → Mitigation: 先做最小 Cockpit shell、四个 tab、timeline/inspector、approval/settings，再做样式精修。
- [Risk] Runtime event subscription 不完整 → Mitigation: `subscribeRun` 保留接口，初期以 snapshot refresh fallback 保证 UI 可用。
- [Risk] Stop 语义与 AgentLoop 状态机不完全一致 → Mitigation: 先定义 cancel runtime message 和 `cancelled` snapshot 状态，不改变工具执行策略以外的 Agent 决策语义。
- [Risk] Settings UI 泄露 API key → Mitigation: password input、masked display、trace/storage 测试和 UI 测试覆盖明文不出现。
- [Risk] Approval drawer 被误解为新增 submit 能力 → Mitigation: 文案和 specs 明确 v0.4 只消费 v0.33 approval hook，不新增 submit-with-approval。
- [Risk] 新增 `lucide-react` 增加 bundle 体积 → Mitigation: 只按需 import 图标，不引入额外图标框架。
