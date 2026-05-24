## 1. 契约与测试基线

- [x] 1.1 定义 observation、element ref、a11y snapshot、observation context summary 的 Zod schema 和 TypeScript 类型。
- [x] 1.2 增加 `REF_NOT_FOUND`、`REF_STALE`、`CONTENT_SCRIPT_UNAVAILABLE`、`OBSERVATION_BUDGET_EXCEEDED`、`OBSERVATION_FAILED` 等结构化错误码。
- [x] 1.3 建立 DOM 测试 fixture：`basic-form.html`、`interactive-elements.html`、`dynamic-page.html`、`security/prompt-injection.html`。
- [x] 1.4 增加 DOM 测试 helper，用于在测试中加载 fixture、模拟 location/title、触发 DOM mutation。
- [x] 1.5 建立 runtime/provider 分层目录：`src/runtime/**`、`src/background/runtime/**`、`src/storage/chrome/**`，用于隔离 UI、background provider 请求和 content observation。

## 2. Page Observation 核心

- [x] 2.1 实现 `page-metadata`，读取 `url`、`title`、`currentDomain`、`origin` 并覆盖 URL 异常场景。
- [x] 2.2 实现 `visible-text`，提取可见文本并应用确定性 budget、截断和 warning。
- [x] 2.3 实现 `page-state`，生成只读页面状态摘要和 empty reason。
- [x] 2.4 实现 `observation-compressor`，输出受限 `ObservationContextSummary`，禁止 full DOM/a11y/ref map 进入模型上下文。
- [x] 2.5 实现 `build-observation`，组合 metadata、visible text、page state、a11y snapshot 和 ref summary。
- [x] 2.6 在 observation summary 中强制保留 `origin`、`currentDomain`、页面 URL，并将页面文本标记为来自该来源的 data。

## 3. A11y-like Snapshot 与 RefMap

- [x] 3.1 实现 accessible name 与 role 解析，优先复用 DOM APIs、`dom-accessibility-api`、`aria-query`。
- [x] 3.2 实现 interactive candidates 扫描，覆盖 button、input、textarea、select、a、ARIA role 和 disabled/visible 状态。
- [x] 3.3 实现 accessibility-like tree 基础序列化，返回 role、name、tagName、visible、disabled、refId。
- [x] 3.4 实现 RefMap，负责 stable `ref_id` 生成、DOM node 映射和 ref summary。
- [x] 3.5 实现 ref resolve 与 stale 检测，覆盖 `REF_NOT_FOUND`、`REF_STALE` 和 refresh 后重新映射。
- [x] 3.6 将 RefMap 作用域绑定到 tab/document/origin，导航或 origin 变化后旧 ref 必须 stale，不得跨域复用。

## 4. Content RPC 与真实工具

- [x] 4.1 定义 background/content RPC message schema，覆盖 observe、a11y snapshot、resolve ref、refresh refs。
- [x] 4.2 在 content script 中注册只读 RPC handler，并将浏览器不可用、timeout、异常转换为结构化结果。
- [x] 4.3 在 background/tool 边界实现 content RPC client，支持当前 tab 调用和 `CONTENT_SCRIPT_UNAVAILABLE`。
- [x] 4.4 实现 `bh_page_observe`，返回 full observation ToolResult，并设置 summary context。
- [x] 4.5 实现 `bh_a11y_snapshot`、`bh_a11y_resolve_ref`、`bh_a11y_refresh_refs` 并接入 ToolRegistry。
- [x] 4.6 确认 content script 只处理 DOM/a11y/ref observation，不读取 provider key，不向 DeepSeek/OpenAI-compatible API 发起请求。

## 5. Runtime Provider 边界

- [x] 5.1 定义 `RuntimePort`、`ExtensionRuntimePort` 和 runtime message schema，确保 side panel 只能通过 runtime port 启动 run、订阅状态和读取 snapshot。
- [x] 5.2 实现 `BackgroundRuntimeHost` / `run-manager` 骨架，用于在 background/service worker 中装配 AgentLoop、ToolRouter、TraceRecorder 和 SettingsStore。
- [x] 5.3 实现 `provider-client-factory`，只允许从用户设置或开发配置创建 `OpenAICompatibleClient`，并校验 provider `baseUrl`。
- [x] 5.4 实现 chrome settings store 骨架，保存 provider baseUrl/model/key 时避免 key 进入 trace、content message 或 UI 可见调试 payload。
- [x] 5.5 增加分层约束测试或静态检查：UI/content/page 不得 import `OpenAICompatibleClient`、`src/agent/model/**` 或直接调用 provider endpoint。

## 6. Agent Context、Trace 与安全边界

- [x] 6.1 确保 full observation 可进入 trace，模型上下文只接收 observation summary。
- [x] 6.2 增加 prompt injection fixture 测试，验证页面文本只出现在 observation data / visible text summary，不改变 system prompt、tool policy 或 tool contract。
- [x] 6.3 覆盖 observation budget 超限路径：截断 warning 或 `OBSERVATION_BUDGET_EXCEEDED`。
- [x] 6.4 回归 v0.1 AgentLoop、ToolRegistry、TraceRecorder、ContextCompactor 既有测试，确保行为不受影响。
- [x] 6.5 增加 LLM 跨域隔离测试：不同 origin 的 observation summary 必须保留来源标签，旧 origin ref 在新 origin 下返回 stale 或要求 re-observe。
- [x] 6.6 增加 provider API 边界测试/检查：provider `baseUrl` 只能来自用户设置或开发配置，不能来自页面文本、observation data 或模型输出；API key 不进入 content script、页面上下文或 trace payload。

## 7. Side Panel 只读 MVP

- [x] 7.1 实现页面观察状态展示：URL、标题、可见文本摘要、页面状态、交互元素数量。
- [x] 7.2 实现 Ref 映射状态展示：ref_id、role、name、tagName、visible、disabled。
- [x] 7.3 实现 empty 状态和 error 状态，展示 reason、错误码、摘要和可操作提示。
- [x] 7.4 对齐 `01-page-observation.png` 的页面观察 tab：顶部品牌区、连接状态、任务输入、tab、摘要卡片、预览卡片、工具结果、Trace/调试日志。
- [x] 7.5 对齐 `02-ref-mapping.png` 的 Ref 映射 tab：统计条、Ref 表格、状态说明、工具结果、Trace/调试日志。
- [x] 7.6 按 roadmap 视觉要求检查 side panel：窄面板可读、信息密度适中、暖色克制、高对比、中文清晰。

## 8. 验收与文档同步

- [x] 8.1 运行 schema、DOM、node tool、agent regression 测试，并记录无法运行的 browser/extension integration 验证原因。
- [x] 8.2 运行 `npm run typecheck`、`npm run lint`、`npm test`。
- [x] 8.3 建立 POM 风格 extension E2E 测试结构：`tests/e2e/extension/*.spec.ts`、`tests/e2e/pages/*.ts`、`tests/e2e/helpers/*.ts`、`tests/e2e/fixtures/**`。
- [x] 8.4 增加 POM E2E 用例：observe basic form、render ref mapping、handle stale ref、handle content unavailable、keep prompt injection as data。
- [x] 8.5 提供可重复运行的 E2E 命令，并验证 E2E 使用本地 unpacked extension，不依赖 Chrome Web Store。
- [x] 8.6 在当前环境尝试自动化加载 unpacked extension；若成功，运行 POM E2E 并覆盖 fixture 页面、content script、background/content RPC、observation、ref mapping、stale/error/prompt-injection 核心链路。
- [x] 8.7 将真实 Chrome side panel、扩展权限 UI、系统弹窗、设计稿截图视觉对照列为环境门控项；能自动验证则验证，不能验证则记录阻塞步骤和后续人工复验清单。
- [x] 8.8 用 Browser 或可用浏览器验证 side panel 页面观察、Ref 映射、empty、error 状态；如环境阻塞，记录具体原因。
- [x] 8.9 用 Browser 对 side panel 截图，并与 `docs/design/v0.2-page-observation-ref/01-page-observation.png`、`02-ref-mapping.png` 做视觉对照，记录差异和修复结论；该项不作为 E2E 自动测试断言，无法无人值守完成时标记为环境门控。
- [x] 8.10 最终验收报告必须区分：真实调用、自动化 E2E、mock/静态检查、手工检查、因环境阻塞未验证。
- [x] 8.11 核对 roadmap AC1-AC10 覆盖矩阵，并补齐偏离说明。
- [x] 8.12 更新 `implementation-notes.md`，记录本次设计决策、偏差、权衡和待确认项。
