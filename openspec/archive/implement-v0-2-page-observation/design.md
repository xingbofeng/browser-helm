## Context

v0.1 已完成 agent kernel、tool contract、trace、context compaction 和 approval-required 协议，但真实浏览器能力仍为空壳：`content.ts` 与 `background.ts` 尚未建立 RPC，agent 只能调用 mock page observation。v0.2 以 `docs/roadmap/v0.2-page-observation.md` 为标准，目标是在 extension 内建立第一个真实、只读、可测试的 page/a11y observation 层。

核心约束：

- `agent` 不直接访问 DOM、Chrome API 或 UI。
- `tools` 通过工具契约包装 browser/page 能力。
- `page` 层只负责 DOM/a11y/ref/observation，不知道模型。
- full observation 用于 trace/storage；模型上下文只能接收受限 summary。
- v0.2 不做 mutating actions，不做完整 cockpit UI，不做 iframe/shadow DOM 深度支持。

## Goals / Non-Goals

**Goals:**

- 建立 background/content script RPC，支持只读 page/a11y 调用。
- 实现 `bh_page_observe`、`bh_a11y_snapshot`、`bh_a11y_resolve_ref`、`bh_a11y_refresh_refs`。
- 生成包含 URL、title、currentDomain、origin、visible text、page state、interactive candidates、ref summary 的 observation。
- 建立 stable `ref_id` 与 DOM node 的映射、刷新和 stale 检测基础机制。
- 将 full observation 与 context observation summary 分层，避免 DOM/a11y/ref map 全量进入模型上下文。
- 覆盖 prompt injection fixture，保证页面文本只作为 data 处理。
- 实现 roadmap 中的只读 MVP side panel 状态：页面观察、Ref 映射、empty、error。

**Non-Goals:**

- 不做 click/type/scroll/nav 等 mutating action。
- 不做正式 cockpit UI、完整交互元素 tab、表单字段 tab。
- 不做 console/network debug、DevTools/CDP、screenshot/vision。
- 不做 iframe/shadow DOM 深度支持。
- 不做正式 prompt injection eval runner。
- 不新增 planner、workflow replay、memory 或 domain adapter 行为。

## Decisions

### Decision 1: 使用 content RPC 作为唯一真实页面访问边界

选择：background/tool 层通过 content RPC 请求当前 tab 的 content script，content script 内部调用 `src/page/**` 读取 DOM/a11y/ref 信息。

替代方案：让 tool 直接依赖 Chrome scripting 或 DOM。缺点是会破坏 `agent 不碰浏览器` 与 `page 不知道模型` 的边界，也会让 Node 工具测试和 content 测试难以隔离。

原因：content RPC 是 extension 架构里最清晰的隔离点，可以把不可注入、timeout、tab 不存在等浏览器失败统一转换为结构化 ToolResult。

### Decision 2: 构建 accessibility-like tree，而不是依赖浏览器内部 accessibility tree

选择：用 DOM APIs、`dom-accessibility-api` 和 `aria-query` 构建适合 agent 使用的 accessibility-like snapshot。

替代方案：尝试读取 Chrome 原生 accessibility tree。缺点是 content script 无法稳定直接访问完整 Chrome accessibility tree，且会引入 DevTools/CDP 范围，超出 roadmap。

原因：v0.2 需要先稳定识别按钮、输入框、链接和可读名称，并给它们分配 ref_id。完全复刻浏览器 a11y tree 不是本版本目标。

### Decision 3: ref_id 由 RefMap 管理，不把 CSS selector 作为模型接口

选择：content/page 层维护 `ref_id -> DOM node` 映射；模型和后续工具只使用 ref_id；resolve 时检测 missing/stale 并返回 `REF_NOT_FOUND` 或 `REF_STALE`。

替代方案：让模型返回 CSS selector。缺点是 selector 容易脆弱、暴露 DOM 细节，也不符合 roadmap 对 stable ref 的要求。

原因：stable ref 是 v0.2 的核心地基，后续 v0.31/v0.32/v0.33 都应复用同一 ref 生命周期。

### Decision 4: full observation 与 context summary 强制分层

选择：工具返回的 full observation 进入 trace/storage；`context.visibility` 使用 `summary`，模型上下文只注入 `ObservationContextSummary` 和必要 ref highlights。

替代方案：把完整 DOM、完整 a11y tree 或完整 visible text 直接放入模型上下文。缺点是容易上下文爆炸，也会扩大 prompt injection 风险。

原因：v0.1 已确立完整 ToolResult 与模型可见上下文分离。v0.2 必须继承该边界。

### Decision 5: observation budget 先采用确定性截断和 warning

选择：visible text、a11y tree、ref highlights 和 summary 都受 budget 限制；超出时返回截断说明，无法生成合规摘要时返回 `OBSERVATION_BUDGET_EXCEEDED`。

替代方案：用 LLM 做摘要。缺点是引入额外模型调用和测试不稳定性，且 roadmap 未要求。

原因：v0.2 需要可重复测试的本地实现，先用确定性规则满足安全与可测性。

### Decision 6: prompt injection 防护落在数据边界，不做 eval runner

选择：fixture 中的恶意页面文本保留在 observation data / visible text summary 中，但不得改变 system prompt、tool policy 或 tool contract。

替代方案：实现正式 prompt injection eval runner。缺点是超出 roadmap 的明确排除项。

原因：本版本要验证上下文边界和 prompt 拼装纪律，不建立完整安全评测平台。

### Decision 7: 测试分层按风险边界组织

选择：0.2 测试分四层推进。

1. Schema/node 层：验证 ToolResult、observation schema、错误码、ToolRouter 接入和 v0.1 regression。
2. DOM 层：用 fixture 在 jsdom/happy-dom 类环境中验证 metadata、visible text、a11y-like snapshot、RefMap、stale ref、budget、prompt injection。
3. Extension E2E 层：使用本地 unpacked extension 验证 background/content message schema、content unavailable、timeout、当前 tab observe，并按 POM（Page Object Model）组织测试代码。
4. UI/浏览器层：用 Browser 打开 side panel，覆盖页面观察、Ref 映射、empty、error 状态，并保存截图作为视觉验收证据。

替代方案：只做单元测试和手工检查。缺点是无法证明 content RPC 与 UI 状态真的连通，也无法证明设计稿关键布局落地。

原因：0.2 同时改 schema、DOM、extension runtime 和 UI，单一测试层无法覆盖主要风险。

E2E 代码约束：

- E2E MUST 使用 Page Object Model，不允许在 spec 文件中散落复杂 selector、打开插件、触发 observe、读取 ref 表格等流程细节。
- POM 至少包含 fixture page、extension/side panel page、page observation panel、ref mapping panel、error state 的对象封装。
- spec 文件只表达用户级场景和断言，例如 observe basic form、render ref mapping、handle stale ref、handle content unavailable、keep prompt injection as data。
- POM 不负责断言设计稿一致性；视觉对照是单独验收任务。

E2E/POM 目录结构：

```txt
tests/e2e/
├── extension/
│   ├── page-observation.spec.ts
│   ├── ref-mapping.spec.ts
│   ├── ref-staleness.spec.ts
│   ├── content-unavailable.spec.ts
│   └── prompt-injection.spec.ts
├── fixtures/
│   ├── basic-form.html
│   ├── interactive-elements.html
│   ├── dynamic-page.html
│   └── security/
│       └── prompt-injection.html
├── helpers/
│   ├── extension-id.ts
│   ├── fixture-server.ts
│   └── launch-extension.ts
└── pages/
    ├── FixturePage.ts
    ├── ExtensionShellPage.ts
    ├── SidePanelPage.ts
    ├── PageObservationPanel.ts
    ├── RefMappingPanel.ts
    └── ErrorStatePanel.ts
```

命名边界：

- `extension/*.spec.ts`：只写场景、POM 调用和断言。
- `pages/*.ts`：封装 locator、用户动作、UI 状态读取。
- `helpers/*.ts`：封装 extension 启动、fixture server、extension id 解析。
- `fixtures/**`：只放测试 HTML 页面，不放测试逻辑。

### Decision 8: 设计稿一致性采用“视觉对照 + 结构化检查”

选择：以 `docs/design/v0.2-page-observation-ref/01-page-observation.png` 和 `02-ref-mapping.png` 为视觉参考，最终验收时用 Browser 截图对照，并检查关键结构、状态、密度、颜色、中文可读性和窄面板布局。

必须对齐的视觉要点：

- 右侧 side panel 顶部有 BrowserHelm 标识、版本、连接状态、任务输入框。
- tab 顺序和命名与设计稿一致：页面观察、Ref 映射、交互元素、表单字段；v0.2 可只实现前两个 tab 的真实内容，后两个保持只读预览/占位。
- 页面观察 tab 展示页面摘要、当前 URL/标题、可见文本摘要、页面状态、Ref 映射预览、交互元素预览、表单字段预览、工具结果、Trace/调试日志。
- Ref 映射 tab 展示统计条、Ref 映射表、状态说明、工具结果、Trace/调试日志。
- 视觉风格保持暖色、克制、高对比，适合 extension side panel，不做营销页式 hero。
- 支持窄 side panel 宽度，文字不溢出，表格可扫描。

替代方案：只按功能实现 UI，不对照设计稿。缺点是 0.2 明确有模拟设计稿，最终效果容易偏离产品预期。

原因：设计图不是像素级 Figma spec，但它定义了 0.2 cockpit prototype 的信息架构和视觉方向；需要用截图验收保证实现没有跑偏。

### Decision 9: 真实浏览器验收采用分级门控

选择：0.2 不跳过真实插件链路验证，但把验收分为“必须通过”和“环境门控”两类。

必须通过：

- `npm run build` 能生成本地 unpacked extension。
- schema、DOM、node tool、agent regression 测试通过。
- POM E2E 结构和用例存在，且在当前环境可运行的部分必须运行。
- 如果自动化 Chromium 能加载 unpacked extension，则必须验证 fixture 页面、content script、background/content RPC、observation、ref mapping、stale/error/prompt-injection 核心链路。

环境门控：

- 真实 Chrome side panel 打开与交互。
- Chrome 权限 UI、扩展权限确认或系统安全弹窗。
- 设计稿截图视觉对照。
- 任何需要人工开启、确认或使用本机真实 Chrome profile 的步骤。

规则：环境门控项不能默默跳过。完成报告 MUST 区分“真实调用已验证”“mock/静态检查已验证”“自动化 E2E 已验证”“因环境阻塞未验证”，并写明阻塞命令、现象和后续人工检查步骤。

替代方案：把所有真实浏览器验收作为 0.2 阻塞项。缺点是无人值守时容易卡在 Chrome UI 或 side panel API，导致核心实现无法收口。

原因：真实插件链路很重要，但本版本开发可以先保证自动化可验证边界；需要人工介入的浏览器 UI 作为明确门控项保留，不伪造通过结果。

### Decision 10: LLM 上下文按 origin/domain 隔离

选择：observation summary、ref map、trace 中的页面观察数据 MUST 携带 `origin`、`currentDomain` 和页面 URL；模型上下文里必须明确标注这些内容来自哪个页面来源。RefMap 的有效性至少按 tab/document/origin 作用域约束，导航或 origin 变化后旧 ref 必须视为 stale 或需要重新 observe。

本版本处理的“LLM 跨域问题”包括：

- 模型不能把 A 域页面内容当成 B 域页面事实。
- 模型不能在 B 域复用 A 域生成的 ref_id。
- 页面文本中的跨域指令，例如“去另一个网站执行操作”或“忽略其他域的限制”，只能作为页面 data 进入 summary。
- observation summary 必须携带来源标签，后续 domain policy、memory、workflow replay 可以据此做边界判断。
- v0.2 不实现完整跨域 memory policy，也不实现跨域 workflow replay；只建立元数据和上下文隔离地基。

替代方案：只记录 URL，但不在上下文和 ref 生命周期中使用 origin。缺点是 LLM 容易把跨页面/跨域 observation 混用，后续引入 memory 或 action 工具时风险会放大。

原因：BrowserHelm 是浏览器 agent，页面内容本身可能是 untrusted input。origin/domain 是最低限度的上下文边界，必须在 0.2 就进入 observation 和 ref lifecycle。

### Decision 11: LLM Provider API 请求只能走 extension runtime 边界

选择：如果 0.2 UI 或 runtime 需要调用 DeepSeek/OpenAI-compatible API，请求 MUST 从 extension background/service worker 的 provider client 发起，不能从 content script 或被观察页面上下文发起。Side panel 不直接持有 provider key；React UI 通过 runtime port 触发 agent run，由 background/model 层读取设置并执行请求。

跨域/CORS 处理原则：

- 不能让 content script 调用 DeepSeek API。content script 只读取页面 DOM/a11y/ref，不持有 API key，不发起 LLM provider 请求。
- 不能让页面 JS 参与 provider 请求。页面内容只作为 observation data。
- DeepSeek/OpenAI-compatible 请求必须走受控 provider client，并经过 settings/provider config。
- provider `baseUrl` 不能来自页面文本、observation data 或模型输出；只能来自用户设置或开发环境配置。
- 当前 `wxt.config.ts` 有 `host_permissions: ['<all_urls>']`，技术上可能覆盖 provider 跨域请求，但实现仍必须在 runtime 层做 provider URL allowlist/validation，避免页面诱导请求任意 endpoint。
- 如果后续收窄权限，DeepSeek 至少需要覆盖 `https://api.deepseek.com/*`；OpenAI-compatible 自定义 endpoint 需要 optional host permission 或明确提示当前 endpoint 未授权。
- v0.2 的 page observation 本身不要求真实 LLM provider 调用；如果无人值守环境无法验证真实 DeepSeek 请求，必须在验收报告中标记为 provider/network 环境门控，不得伪造通过。

替代方案：side panel 直接 `fetch(baseUrl)` 调用 provider。缺点是 UI 会持有 key，CORS/权限失败更难统一处理，也容易让页面内容和 provider 请求边界混在一起。

原因：浏览器插件里 provider 请求同时涉及 CORS、host permissions、密钥保护和 prompt injection。统一放在 background/model 层能把网络权限、key、trace masking 和错误处理集中管理。

目录分层落地：

```txt
sidepanel React UI
  -> src/runtime/RuntimePort.ts
  -> src/runtime/ExtensionRuntimePort.ts
  -> src/background/runtime/BackgroundRuntimeHost.ts
  -> src/agent/kernel/AgentLoop.ts
  -> src/agent/model/OpenAICompatibleClient.ts
  -> DeepSeek/OpenAI-compatible API

content script
  -> src/page/**
  -> DOM / a11y / ref observation
```

需要在 0.2 补齐的目录：

```txt
src/background/runtime/
├── BackgroundRuntimeHost.ts
├── run-manager.ts
└── provider-client-factory.ts

src/runtime/
├── RuntimePort.ts
├── ExtensionRuntimePort.ts
└── runtime-messages.ts

src/storage/chrome/
└── chrome-settings-store.ts
```

分层规则：

- `src/entrypoints/sidepanel/**` 和 `src/ui/**` MUST NOT import `OpenAICompatibleClient`、`AgentLoop`、`ToolRouter` 具体实现或直接调用 provider `fetch`。
- `src/entrypoints/content.ts` 和 `src/page/**` MUST NOT import `src/agent/model/**`、provider settings 或 storage 中的 API key。
- `src/background/runtime/**` 是 extension 内装配 AgentLoop、ToolRouter、TraceRecorder、SettingsStore、ModelClient 的边界。
- `OpenAICompatibleClient` 可复用，但只能由 background runtime/provider factory 创建。
- `SettingsStore` 需要 chrome storage 实现，但 API key 不得进入 trace 或 content script message。

## Risks / Trade-offs

- [Risk] accessibility-like tree 与真实浏览器 a11y tree 存在差异 → Mitigation：明确命名为 accessibility-like，并用 fixture 覆盖核心交互元素，而不是承诺完整等价。
- [Risk] DOM 更新导致 ref 生命周期复杂 → Mitigation：v0.2 只做基础 stale 检测和 refresh，不做复杂 selector recovery。
- [Risk] Chrome 不可注入页面导致 observation 失败 → Mitigation：返回 `CONTENT_SCRIPT_UNAVAILABLE`，并在 UI/error summary 中明确提示。
- [Risk] observation payload 过大 → Mitigation：引入 budget、summary、truncation warning 和 `OBSERVATION_BUDGET_EXCEEDED`。
- [Risk] side panel MVP 膨胀成完整 cockpit → Mitigation：只实现 roadmap 指定的页面观察、Ref 映射、empty、error 状态。
- [Risk] browser/extension integration 测试环境不稳定 → Mitigation：核心 DOM/ref/summary 逻辑优先用 DOM tests 覆盖，真实 extension RPC 在可行范围内补集成测试；无法验证时在完成报告中明确说明。
- [Risk] 实现效果与模拟设计稿偏离 → Mitigation：实现前拆出 UI 状态清单，完成后用 Browser 截图对照两张参考图，并记录差异和接受/修复结论。
- [Risk] 无人值守环境无法完成 Chrome side panel 或权限 UI 验证 → Mitigation：自动化加载 unpacked extension 的 E2E 优先运行；需要人工操作的真实浏览器步骤标记为环境门控，并在完成报告中给出复验清单。
- [Risk] LLM 混用不同域的页面内容、ref 或后续记忆 → Mitigation：observation summary 和 ref map 强制携带 origin/currentDomain，origin 变化后旧 ref 失效；模型上下文明确标注页面来源。
- [Risk] side panel 或 content script 直接请求 DeepSeek/OpenAI-compatible API 导致 CORS、权限、密钥泄露或 endpoint 注入问题 → Mitigation：provider 请求只能走 background/service worker 的 provider client；content script 不持有 key，不发 provider 请求；baseUrl 只来自用户设置或开发配置。
