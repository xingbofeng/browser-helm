# implementation-notes

## 全局规则（保留为优先约束）

2026-05-24 以后每次开始会话时优先读取 `CONTEXT.md`、`handoff.md`（若存在）、`implementation-notes.md`。  
文档语言统一中文；代码与实现风格按仓库现有约定执行。  
遇到高风险/边界问题，优先补齐验证路径，不先追求最短路线。  
涉及真实浏览器、side panel、content/runtime RPC 的改动，必须做：`npm run build`、`npm run typecheck`、`npm run lint`，并尽量补 `npm run test:e2e`。  
工具新增/迁移必须保留 `ToolSpec.title` 中文维护说明、完整 schema 与风险边界，并同步 `src/tools/README.md`。  
新增依赖要解释必要性，避免先验假设；实现与验收按最小闭环推进。  
偏离既定决策必须在“偏差说明”里记录原因与影响。  
超过一次对话的历史决策、执行细节与临时验证内容，归档到 `implementation-notes-archive.md`。

> 备注：当前会话要求“全局规则先行”，主文件只保留高频共识；历史细节不再展开在主文件中。

## [2026-05-24 任务摘要]

### v0.1：Agent Kernel
- 完成 OpenSpec 约束下的 kernel/runtime 与 trace 契约收口；保留上下文压缩策略与工具调用可解释日志。  
- 风险点：`ToolResult.data` 不直接拼给模型；通过 context summary 与 context compaction 做隔离。

### v0.1 Review 收口
- 补齐工具协议未完整入模问题：ToolRouter 提供 contract，AgentLoop 只编排执行。  
- 引入高风险工具审批阻断，确保 high-risk 不可绕过运行时审批策略。

### v0.2：页面观察与 Ref 原型
- 建立真实页面观察链路与 side panel 只读承载，content/runtime 边界固定在 background。  
- 完成真实 extension 调试与 E2E 验证，补齐 empty/prompt-injection/ref stale/error 等场景。

### v0.2 运行与测试工程化收口
- 引入 `debug:extension` / `debug:extension:watch`，采用 Chrome for Testing（避免系统 Chrome 不再稳定自动加载 unpacked）。  
- 统一三层 POM（specs/flows/pages、components）与 E2E 稳定层。  
- 侧边栏在无 `tabId` 时改按 active tab + tab 切换/导航监听刷新观察快照。

### 文件与命名治理
- 推进 kebab-case 与 `src/tools/README.md` 清单同步。  
- 全仓库命名归一化后，补齐引用并保证构建与 lint/typecheck 通过。

### 调试与开发体验
- `agent:dev`、`test:e2e` 与 E2E debug 走可复现、可自动化路径。  
- side panel 的文案/可见性与旧快照残留问题修正后，watch 重启机制改为会话重启，避免 `chrome-extension://` 访问抖动。

### v0.3：Structured Page Data
- 引入结构化页面数据总契约（observation/ref/interactive/forms）与状态模型。  
- 统一 empty / unsupported / error 状态语义，UI 和 trace 使用可确定性摘要。  
- 复杂内容仍保持只读范围，动作用例保留到后续版本。

### v0.31 / v0.32 决策框架
- 明确只做只读识别与诊断：interactive 与 form 先识别，不承诺 action readiness。  
- 引入最小 Run Mode Gate（Ask/Debug/Form 三模式）先行裁剪工具可见性。  
- 归并 roadmap 与架构说明，区分 interactive/form 与后续 action readiness 的边界。

### v0.3 数据流与文档化
- 完成 v0.3 架构图 + 数据流图替换（图片化资产），提高文档可读性。  
- OpenSpec 流程按变更完整状态推进并验证。

### v0.33 / v0.4 roadmap 配图补齐
- 参考 v0.31 / v0.32 的现有系列样式，为 v0.33 Safe Action Readiness 与 v0.4 Cockpit UI 补齐内嵌架构图。  
- 路线图文档改为直接引用 `docs/roadmap/assets/` 下的本地图片资产，保持后续维护路径一致。  
- v0.33 从“设计图不适用”调整为“技术架构图适用”，用于表达 approval contract 与 runtime 状态边界。

## 重要待确认（跨版本）

- [ ] 是否将终止工具 (`bh_agent_finish` / `bh_agent_fail` / `bh_agent_ask_user`) 迁移为自然 terminal decision 的独立语义？  
- [ ] 是否将“外部 URL 的人工验证清单”写入固定的 debug checklist。  
- [ ] 是否将 `BROWSER_HELM_AGENT_URL` 从默认值改成必须显式传参。  
- [ ] v0.31/v0.32 interactive 与 forms 上线后，是否继续保留 current placeholder 文案，还是直接切到最小可交互展示。
- [ ] v0.33 若先实现 `bh_iframe_read` / `bh_iframe_click` / `bh_iframe_type`，后续进入 submit 类动作时提醒用户单独确认 `iframe_submit` / `bh_form_submit_with_approval` 的 approval UI、字段摘要和 submit 前 verify 边界。
- [ ] v0.33 需要一次性补齐所有现有 `src/tools/` 工具的 TSDoc/JSDoc 风格块注释；新增 iframe/action readiness 工具也必须按同一标准落地。该要求已记录到 `AGENTS.md` 的工具实现规范。

## [v0.33 漏提交与 v0.4 Cockpit 骨架补齐] - 2026-05-25

**目标**：修复前次提交漏掉的 OpenSpec v0.4 提案/UI 骨架与新增测试，并把工具名、runtime message、content RPC message、trace/error code 等字符串收敛到常量。

**设计决策**：选择保留现有产品 side panel 入口，Cockpit UI 先作为独立 `src/ui/sidepanel/cockpit-app.tsx` 骨架和测试对象存在。原因：v0.4 仍处于提案/骨架阶段，不能破坏 v0.33 已通过的 extension E2E 产品验收。

**偏差说明**：本次不归档 v0.4 change，只提交提案与最小可测骨架。原因：v0.4 尚未进入完整实现验收；当前目标是修复漏提交和常量化问题。

**权衡分析**：
- 方案一：把 CockpitApp 直接替换成产品 side panel。优点是能更快看到新 UI；缺点是会破坏旧 E2E 与既有产品行为。
- 方案二：旧入口继续服务产品验收，CockpitApp 先通过 runtime port/fake port 做组件级闭环。优点是风险小、测试稳定；缺点是 UI 正式切换要留到 v0.4 后续实现。
- 选择方案二，因为它符合当前版本边界，也避免把提案阶段 UI 混入产品路径。

**验证记录**：
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：92 files / 318 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：10 passed。

**待确认**：
- [ ] v0.4 正式实现时，再确认 CockpitApp 何时替换 legacy side panel 产品入口。

## [v0.4 Cockpit UI 实现] - 2026-05-25

**目标**：按照 roadmap 与 OpenSpec 完成 extension side panel Cockpit UI，覆盖页面观察、Ref、交互元素、表单字段、timeline、tool inspector、trace、approval、settings、run/stop 状态。

**设计决策**：引入 `lucide-react` 作为按钮与状态图标来源，避免手写 SVG 并保持 UI 控件语义一致；Cockpit UI 拆分到 `src/ui/**`，entrypoint 只负责 runtime 注入和 URL 参数解析；UI 只依赖 RuntimePort / snapshot，不直接导入 Agent Kernel、ContextCompactor、ToolRouter、ModelClient 或 content script 内部模块。

**偏差说明**：不写 ADR；真实浏览器验收只覆盖 E2E 难以覆盖的 extension host / 原生 side panel 场景，常规行为以 Vitest 与 POM E2E 自动化为准。

**权衡分析**：
- 方案一：继续在单个 sidepanel App 中累加 UI。优点是改动集中；缺点是难以测试、难以复用，也不符合 v0.4 组件拆分要求。
- 方案二：按 shell、tabs、timeline、inspector、approval、settings、stores 和 lib 分层。优点是边界清晰、测试可拆；缺点是新增文件较多。
- 选择方案二，因为 v0.4 需要覆盖多个状态和验收路径，组件化比单文件更容易保持类型与 E2E 稳定。

**待确认**：
- [ ] 后续视觉精修是否需要接入正式 Figma 设计稿。
- [ ] 原生 side panel 的最终人工验收清单是否固定写入 debug checklist。

## [v0.4 安全边界复查收口] - 2026-05-25

**目标**：根据 review 反馈补强 iframe mutating RPC 与 Act mode 工具暴露边界。

**设计决策**：保留现有 runtime action token，不另起一套授权机制；在 content handler 内增加最低限度 readiness 防线，即使带 token 也会阻止 disabled / mismatch / still requires approval 的 iframe mutation。Act mode 改为只允许 `act` 标记工具和显式共享工具，避免未来新增 `ask` 工具自动进入 Act。

**偏差说明**：本次不重构 `PolicyEngine -> ApprovalManager -> runtime host` 全链路。原因：这属于更大的架构收敛，当前先修可达安全边界和可回归行为。

**权衡分析**：
- 方案一：只依赖工具层 readiness。优点是改动少；缺点是 content RPC 作为可变更页面 primitive 时缺少纵深防御。
- 方案二：工具层与 content handler 都做最小 readiness。优点是绕过工具层时仍不会直接改页面；缺点是 handler 需要理解 action readiness。
- 选择方案二，因为 iframe click/type 是页面 mutation 入口，需要在最靠近 DOM 的位置保留最后一道防线。

**待确认**：
- [ ] 后续是否将 policy / approval / readiness 串成单一架构链路并删除重复判断。

## [v0.4 Cockpit 完成度缺口修复] - 2026-05-25

**目标**：修复 review 指出的 v0.4 Cockpit UI 缺口，使 Settings、Tab 视图、stores、细粒度状态和窄面板视觉更贴近 roadmap 的 Complete Cockpit UI Prototype。

**设计决策**：Settings 改为通过 UI 输入保存到 RuntimePort/settings store；CockpitApp 接入 agent/page-data/trace/approval/settings stores，但仍保留 React state 作为渲染层快照，避免一次性引入复杂订阅机制。四个 Tab 改为只渲染当前 active tab，Ref 与 Interactive tab 提供真实筛选。细粒度 run status 先扩展 snapshot/status 与 UI 映射，不改 AgentLoop 的完整状态机。

**偏差说明**：本次没有把所有 runtime event 都升级为实时状态流。原因：当前 RuntimePort 的真实 subscribeRun 尚未完整事件化，v0.4 先保证 snapshot 能表达并驱动 UI，完整 streaming 状态留给后续 runtime 收敛。

**权衡分析**：
- 方案一：重写 CockpitApp 为完全 store-driven 订阅组件。优点是架构更纯；缺点是会扩大 v0.4 收口风险。
- 方案二：实际 UI 使用 stores 作为状态边界，同时保留局部 React state 承载渲染。优点是改动可控、测试稳定；缺点是 store 订阅模型仍需后续增强。
- 选择方案二，因为它能修复当前 roadmap 缺口，又避免在 UI 收口阶段重排所有组件状态。

**待确认**：
- [ ] 后续是否为 `RuntimePort.subscribeRun` 定义完整事件语义，驱动 thinking/executing/recovering 的实时切换。

## [v0.4 Cockpit 设计稿对齐精修] - 2026-05-25

**目标**：根据 docs/design 中 v0.31/v0.32 的四 Tab 风格和 GPT-Image2 新设计稿，精修 v0.4 Cockpit side panel 的交互密度、视觉层级、表格、状态卡和真实扩展截图验收。

**设计决策**：采用暖色 operational dashboard 主题，四个 Tab 统一使用状态 pill、count badge、紧凑表格和详情卡；Settings 默认折叠，Approval 无 pending request 时不渲染空卡。原因：这更接近 v0.31/v0.32 截图里的右侧栏密度，也避免窄 side panel 被低频设置项占满。

**偏差说明**：没有逐像素复刻 GPT-Image2 图中的左侧网页与 Chrome 外框。原因：产品实现对象是 extension side panel，本轮只改真实扩展 UI；左侧网页与浏览器壳仅作为设计参照。

**权衡分析**：
- 方案一：只改 CSS，不改 Tab 结构。优点是风险最小；缺点是仍然像列表，不符合设计稿中的表格和详情卡。
- 方案二：同步改 Tab 结构、样式和 E2E POM。优点是视觉与交互都贴近设计稿；缺点是需要同步维护测试定位。
- 选择方案二，因为用户明确要求交互和样式都向设计稿对齐，单纯换色不足以证明完成。

**验证记录**：
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：93 files / 327 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：13 passed。
- Chrome for Testing SOP：已加载 `.output/chrome-mv3`，通过 CDP 截图验证四个 Tab；520px 宽度下 `bodyScrollWidth=504`、`shellScrollWidth=504`、`shellClientWidth=504`，无页面级横向溢出。

**待确认**：
- [ ] 若后续拿到正式 Figma，需要再做一次像素级对齐。

## [v0.4 Cockpit runtime 闭环修复] - 2026-05-25

**目标**：修复 review 指出的 runtime timeline 空白和 Settings 保存丢失 API key 两个产品闭环问题，并补强自动化验收。

**设计决策**：在 `RunManager` 内为真实 runtime 写入 `run_started`、`tool_started`、`tool_result`、失败/取消/审批状态事件，并把同一份 trace 带入 `RunSnapshot`。Settings 保存时将未输入的新 API key 视为“保留旧 key”，而不是清空 key。

**偏差说明**：本次没有把 UI stores 升级成完整 Zustand/subscriber 架构；也没有把 `startRun` 改为异步流式 run lifecycle。原因：这两项会改变 RuntimePort 和 UI 数据流边界，适合单独提案处理；本次先闭合已确认的产品 bug。

**权衡分析**：
- 方案一：只修测试定位，不改 runtime trace。优点是快；缺点是 Timeline 仍然没有真实步骤。
- 方案二：在 runtime manager 生成最小 trace 并补 E2E。优点是真实 side panel 可以看到步骤；缺点是 trace 语义仍是 snapshot 级，不是完整 streaming。
- 选择方案二，因为它直接修复 v0.4 Cockpit 透明化缺口，且不扩大到 AgentLoop 重构。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：93 files / 329 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：13 passed。
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- Chrome for Testing SOP：已验证真实 side panel Step Timeline 显示 `Run started`、`Tool started`、`Tool result`，Trace 显示 3 条；截图为 `artifacts/v04-cockpit-timeline-settings-fix.png`。

**待确认**：
- [ ] 是否将 RuntimePort 改为真正 streaming/subscription 驱动，以覆盖 thinking/recovering 等中间状态。
- [ ] 是否将 UI stores 从 `getState()` 原型升级为可订阅状态源。

## [v0.4 Runtime streaming 与 UI store 订阅化] - 2026-05-25

**目标**：一次性收口 review 中剩余的两个架构缺口：真实 RuntimePort 事件订阅、UI stores 可订阅并驱动 Cockpit 渲染。

**设计决策**：Runtime streaming 使用 `chrome.runtime.connect({ name: BH_RUNTIME_SUBSCRIBE_RUN })` 建立 side panel 到 background 的长连接，background 通过 `RunManager.subscribeRun()` 推送 `RuntimeEvent`。`RunManager.startRun()` 改为创建 run 后立即返回 runId，初始 observe 在后台异步执行；UI 拿到 runId 后订阅事件，并在事件到达时刷新 snapshot。UI store 不新增 Zustand 依赖，使用 `useSyncExternalStore` + 本地 `SimpleStore.subscribe/setState` 实现 React 官方外部 store 契约。

**偏差说明**：`thinking` / `recovering` 没有被人为造假触发。当前真实 runtime 已驱动 `observing`、`executing_tool`、`waiting_for_approval`、`cancelled`、`failed/error` 等实际存在的状态；`thinking` 和 `recovering` 需要等后续接入真正 AgentLoop/model/recovery 分支时由对应流程发出。

**权衡分析**：
- 方案一：引入 Zustand 并同步重写所有 UI 状态。优点是贴近 roadmap 命名；缺点是新增依赖，且当前 store 需求不复杂。
- 方案二：用 `useSyncExternalStore` 实现可订阅 store。优点是无新增依赖、React 语义正确、改动可控；缺点是没有 Zustand devtools/middleware。
- 选择方案二，因为它完成“stores -> UI render”的架构目标，同时避免为 prototype 引入不必要依赖。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：93 files / 331 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：13 passed。
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- Chrome for Testing SOP：真实 side panel 通过 runtime subscription 刷新，Step Timeline 显示 `Run started`、`Tool started`、`Tool result`，Trace 显示 3 条；截图为 `artifacts/v04-cockpit-streaming-stores-final.png`。

**待确认**：
- [ ] 后续 AgentLoop 接入 Cockpit 时，将 model thinking / recovery 分支映射到 `thinking` / `recovering` 状态。

## [v0.4 Cockpit 柔和岛屿视觉收口] - 2026-05-25

**目标**：在不扩大 v0.4 功能语义的前提下，将 Cockpit UI 调整为 GPT Image 2 设计稿中的柔和岛屿风格，并完成真实 extension host 截图验收。

**设计决策**：把设计稿作为视觉参考而非功能需求；保留 v0.4 已有的观察、Ref、交互元素、表单字段、工具结果、trace、settings 和 approval 表达，不新增“自动执行/验证结果”等当前 runtime 不支持的能力。视觉上采用暖纸底、浅绿主状态、暖橙辅助状态、8px 卡片、CSS 绘制的小船/叶子/底部会话图标，避免引入新图片依赖。

**偏差说明**：未逐字复刻设计稿中的功能文案。原因：设计稿生成时带入了超出 v0.4 的执行语义；本次仅复刻布局密度、色彩、卡片、tab、timeline 和 footer 的视觉语言。

**权衡分析**：
- 方案一：按设计稿文案直接实现。优点是表面更像图；缺点是会误导用户以为 v0.4 已具备完整动作执行和验证能力。
- 方案二：视觉高保真、功能语义保守。优点是满足风格目标且不破坏 roadmap 边界；缺点是与生成图的部分文字不完全一致。
- 选择方案二，因为 Cockpit 是真实产品 UI，不能用设计稿里的过度功能文案替代实际能力。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：93 files / 331 tests passed。
- `npm run test:e2e`：13 passed。
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- Chrome for Testing SOP：已加载 `.output/chrome-mv3`，通过 CDP 截图验证 360px side panel；`bodyScrollWidth=344`、`bodyClientWidth=344`、`hasHorizontalOverflow=false`，Ref tab 点击后 `data-active-tab=refs`。截图位于 `/tmp/browser-helm-cockpit-island-final-360.png` 与 `/tmp/browser-helm-cockpit-island-final-ref-360.png`。

**待确认**：
- [ ] 若需要真正“像素级”生产对齐，后续应以固定尺寸 Figma 或标注稿替代生成图作为唯一基准。

## [v0.4 Cockpit 最终收口修复] - 2026-05-25

**目标**：修复 v0.4 完成度复查中剩余的 approval timeline、ToolInspector detail、auto observe 重复 run 和 settings policy 数据源问题。

**设计决策**：approval decision 直接写入 `approval_approved` / `approval_denied` runtime event，不再只用泛化 `state_changed` 表达；ToolResult snapshot 增加 sanitized `detail`，由 ToolInspector 展示完整但脱敏的结果详情；targetTabId 自动观察只在疑似 iframe 数据尚未 ready 时重试；Settings 策略预留项统一从 settings store 传入。

**偏差说明**：没有实现完整 trace replay 或 action resume。原因：roadmap 明确 v0.4 不做 trace replay，approval approve 在当前动作准备边界内只表示“审批通过，可继续”，不执行 submit/action executor。

**权衡分析**：
- 方案一：保留 `state_changed`，只改 UI label 推断。优点是改动少；缺点是 trace 语义不清晰。
- 方案二：runtime 写明确 approval event。优点是 timeline、trace 和测试语义一致；缺点是需要同步 RunManager/FakeRuntimePort。
- 选择方案二，因为 approval 是 v0.4 的核心安全透明度要求。

**验证记录**：
- `npx vitest run tests/node/runtime/run-manager.test.ts tests/node/ui/components/timeline-inspector.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/stores/settings-store.test.ts`：4 files / 21 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。

## [v1.0.1 Review 风险修复] - 2026-05-26

**目标**：修复 review 中指出的三个风险：Agent markdown 未净化渲染、普通页面观察自动 patch 页面全局 API、Ask mode 选择被自动分类覆盖。

**设计决策**：Markdown 渲染保留 `marked`，但增加 DOM allowlist sanitizer，仅允许基础排版标签和安全链接；页面健康桥保留 content script 内的显式事件监听，移除自动注入 main world 和 fetch/XHR/console monkey patch；用户手动启动 run 时始终传递当前选择的 mode。

**偏差说明**：没有新增 DOMPurify 依赖，也没有实现完整 CDP deep inspection。原因：本次目标是最小修复已确认风险，避免扩大依赖和调试权限边界。

**权衡分析**：
- 方案一：引入成熟 sanitizer 依赖。优点是覆盖面广；缺点是新增依赖，需要单独评估 extension CSP 与包体。
- 方案二：使用窄 allowlist sanitizer。优点是改动小、无新增依赖、符合当前只需基础 markdown 的 UI；缺点是不适合未来复杂富文本。
- 选择方案二，因为当前 Agent 消息只需要基础 markdown 展示，安全边界比富文本能力更重要。

**验证记录**：
- `npx vitest run tests/node/ui/components/v101-agent-components.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/page/messaging/content-rpc-client.test.ts`：3 files / 26 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。

**待确认**：
- [ ] 后续若需要复杂 markdown/HTML 展示，是否引入正式 sanitizer 依赖并补 extension CSP 验证。
- `npm test`：93 files / 332 tests passed。
- `npm run test:e2e`：13 passed。
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。

**待确认**：
- [ ] v1.0 是否需要把 approval approve 后的 action resume 设计为独立显式流程。

## [review 安全收口修复] - 2026-05-25

**目标**：按 review 意见收口当前主干的 P0/P1 安全与语义问题，包括 runtime 工具执行前 approval 阻断、approval approve 文案、表单值脱敏、字段 role/visible、system prompt 注入防线与 forms fallback 文案。

**设计决策**：选择在 `RunManager.executeTool` 中先读取 Tool contract 并调用 `PolicyEngine`，对 high-risk 工具直接创建 approval request，不进入 `ToolRouter.execute()`；`bh_iframe_click` / `bh_iframe_type` 标记为 high-risk，使页面 mutation 默认先审批。表单 `valuePreview` 默认只暴露 `empty` / `non-empty` 或 `[MASKED]`，checkbox/radio 保留 checked/unchecked。

**偏差说明**：本次暂不实现静态 `IFRAME_ACTION_TOKEN` 的 nonce 化。原因：nonce 需要串联 tool、runtime/content RPC 与 replay 防护，适合单独设计和验证；本轮先修 runtime 前置 policy guard 和敏感值边界。

**权衡分析**：
- 方案一：继续依赖工具内部 readiness 返回 `APPROVAL_REQUIRED`。优点是改动少；缺点是 runtime 层仍会调用高风险工具 `execute()`，不满足前置阻断。
- 方案二：runtime 先按 Tool contract risk 进行 policy guard。优点是 high-risk 工具不会被执行；缺点是部分动态 readiness 细节要等用户继续执行后再检查。
- 选择方案二，因为 review 重点是执行前必须阻断，且审批通过当前也不自动 resume/execute。

**待确认**：
- [ ] 后续为 iframe action token 设计每次 action 的 nonce / expiry / request binding，替代静态 `IFRAME_ACTION_TOKEN`。
- [ ] 若需要让“批准后继续执行”避免重复审批，需要补一条已批准 action 的显式消费语义和测试。

## [v1.0 Page Inspector + Form Doctor 实现推进] - 2026-05-25

**目标**：按 OpenSpec `implement-v1-0-page-inspector-form-doctor` 实现 v1.0 的只读诊断闭环骨架：TaskClassifier、Mode System、ToolSelector、Runtime Capability、Form Doctor findings、Page Health、Goal/Plan、RecoveryPolicy、DebugReport、approval runtime formalization 和 Cockpit 诊断概览。

**设计决策**：保持 v1.0 默认只读诊断。AgentLoop 先分类任务、解析 mode、按 capability/risk 裁剪工具，再把 classification、capabilities、tool selection、plan update、recovery action、findings 和 DebugReport 写入 trace。Form Doctor findings 从只读表单字段和 submit summary 汇总 evidence/confidence；DebugReport 面向用户，完整 ToolResult 仍留在 trace。Act mode prompt 明确只做动作准备、readiness、risk、policy 和 approval boundary，不执行 fill/verify/submit。

**偏差说明**：真实 extension side panel 当前仍主要由 RunManager snapshot 驱动，还没有把 AgentLoop 诊断产物完整桥接到 runtime snapshot lifecycle，因此 v1.0 的真实 E2E 展示仍保留为后续任务。已先扩展 RunSnapshot/FakeRuntimePort 和 Cockpit 诊断概览组件，避免 UI 测试伪造超出现有 runtime 的行为。

**权衡分析**：
- 方案一：直接在 E2E 中断言 v1.0 诊断 UI。优点是看起来闭环更快；缺点是当前 runtime 不会真实产生这些 AgentLoop 产物，会导致测试与产品路径脱节。
- 方案二：先完成 AgentLoop/契约/UI 组件层，真实 E2E 等 AgentLoop -> Runtime snapshot 桥接后再收口。优点是语义诚实、边界清楚；缺点是 v1.0 仍有 E2E 待办。
- 选择方案二，因为 v1.0 是安全和诊断能力，不应该用假数据掩盖真实 runtime 集成缺口。

**验证记录**：
- `npx vitest run tests/node/agent/kernel/agent-loop.test.ts tests/node/agent/context/context-builder.test.ts tests/node/agent/prompts/prompt-builder.test.ts tests/node/runtime/fake-runtime-port.test.ts tests/node/ui/components/diagnosis-overview.test.tsx tests/node/ui/styles/cockpit-css.test.ts tests/node/agent/goal/goal-plan.test.ts tests/node/agent/report/findings-report.test.ts tests/node/agent/recovery/recovery-policy.test.ts`：9 files / 41 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npx openspec validate implement-v1-0-page-inspector-form-doctor --strict`：passed。

**待确认**：
- [ ] 是否将 AgentLoop 作为 RunManager 的主执行路径，或保留 RunManager 为页面观察/runtime API，另建 AgentRuntimeBridge。
- [ ] v1.0 E2E 是否接受先覆盖 RuntimePort/FakeRuntimePort + Cockpit 组件，真实 extension host 等桥接完成后再补。

## [v1.0 发布阻断全量收口] - 2026-05-25

**目标**：按 roadmap review 结果修复 v1.0 发布阻断，补齐真实 runtime snapshot 诊断、DebugReport 展示、interrupt/revise goal 最小闭环和 E2E 验证。

**设计决策**：RunManager 在初始 observe 后用缓存 observation 驱动 AgentLoop 诊断，避免二次 PAGE_OBSERVE 造成测试和真实扩展路径抖动；form/debug 模式先落一个 fallback v1 snapshot，再异步合并 AgentLoop trace，保证 side panel 可以稳定显示 mode reason、plan、findings 和 DebugReport。revise goal 通过 RuntimePort 新增显式 `REVISE_GOAL` 消息，更新 GoalState、PlanState 并写入 `plan_updated` trace。

**偏差说明**：v1.0 的 interrupt 仍复用 cancel run，不实现暂停后恢复或 action resume。原因：roadmap 当前要求中途打断和修改目标，恢复执行/继续动作属于后续工作流语义，不能在 v1.0 只读诊断里偷跑。

**权衡分析**：
- 方案一：只修测试断言和文案。优点是改动少；缺点是 revise goal 仍只是 UI 文案，不能满足 US8 / AC8。
- 方案二：补 RuntimePort revise goal 协议、RunManager/FakeRuntimePort 实现、Cockpit 控件和 E2E。优点是 roadmap 语义闭环；缺点是 runtime API 面增加一个最小消息。
- 选择方案二，因为 v1.0 发布判断需要真实扩展路径可验证，而不是只在组件测试里摆出状态。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test -- --run`：104 files / 392 tests passed。
- `npm run test:e2e`：15 passed，包含 v1 Form Doctor、Page Inspector 和 approval boundary 的 Chrome for Testing 扩展路径。

**待确认**：
- [ ] 后续若需要 interrupt 后恢复执行，应设计独立 resume/replay 语义，不复用 v1.0 cancel。

## [v0.4 Cockpit 宽屏 side panel 布局修复] - 2026-05-25

**目标**：修复 Chrome 原生 side panel 被拖宽后 Cockpit UI 自动切成双列，导致表单数据、诊断和工具结果视觉层级混乱的问题。

**设计决策**：移除 `700px+` 的双列媒体查询，让 Cockpit 在 side panel 宿主内始终保持单列驾驶舱流。原因：Chrome side panel 即使变宽，本质仍是嵌入式工具面板；过早切成 dashboard 会把诊断区挤到右栏，破坏阅读顺序。

**偏差说明**：没有重做视觉主题或组件结构。原因：本次问题来自响应式断点，不需要扩大到 v0.4 的整体视觉重构。

**权衡分析**：
- 方案一：把双列断点提高到更大宽度。优点是保留 standalone debug tab 的桌面布局；缺点是原生 side panel 仍可能在超宽拖拽时再次触发同类问题。
- 方案二：side panel 入口固定单列。优点是宿主行为稳定、阅读顺序一致；缺点是超宽调试页不会自动变成两栏。
- 选择方案二，因为真实产品宿主是 Chrome side panel，稳定优先于桌面 dashboard 展示。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- Chrome for Testing SOP：820px side panel debug viewport 下 `bodyScrollWidth=804`、`bodyClientWidth=804`、`shellGridTemplateColumns=784px`、`hasHorizontalOverflow=false`；截图位于 `/tmp/browser-helm-wide-sidepanel-fix.png`。

**待确认**：
- [ ] 如果后续需要 standalone debug tab 的桌面 dashboard 布局，应单独增加 host/context class，而不是复用 side panel 默认断点。

## [v0.4 Cockpit 数据表横向滚动修复] - 2026-05-25

**目标**：修复交互元素等 Cockpit 数据表在约 430px side panel 宽度下出现横向滚动条的问题。

**设计决策**：将 `.bh-dataTable` 从固定最小宽度改为 `table-layout: fixed`、`min-width: 0` 和单元格强制换行，外层只保留纵向滚动；窄面板下隐藏状态辅助文本 `visible=true`，保留主要状态 pill。原因：side panel 是窄工作区，横向滚动会破坏扫描和表格定位。

**偏差说明**：没有把表格改造成卡片列表。原因：当前最小问题是横向溢出，保留表格语义更稳，也避免同步改动多个 tab 组件和测试定位。

**权衡分析**：
- 方案一：在窄屏下改成卡片列表。优点是移动端可读性最好；缺点是改动面较大，且会改变现有表格语义。
- 方案二：保留表格、压缩列并允许内容换行。优点是改动小、语义稳定、能消除横向滚动；缺点是长名称会让行高增加。
- 选择方案二，因为当前 Chrome side panel 更需要稳定无横滚，而不是完整重做数据呈现模式。

**验证记录**：
- `npx vitest run tests/node/ui/styles/cockpit-css.test.ts`：2 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- Chrome for Testing SOP：430px side panel debug viewport 下交互元素 tab `tableWrapScrollWidth=374`、`tableWrapClientWidth=374`、`bodyHasHorizontalOverflow=false`、`tableWrapHasHorizontalOverflow=false`；截图位于 `/tmp/browser-helm-no-horizontal-table-430.png`。

**待确认**：
- [ ] 如果后续字段列继续增多，再评估是否为每个 tab 做专属窄面板卡片布局。

## [v0.4 Cockpit Run Mode 下拉交互] - 2026-05-25

**目标**：将 Cockpit 任务区的 Run Mode 从四段式按钮改为类似 Codex 权限选择的下拉式交互，并放到任务输入框同行右侧。

**设计决策**：使用原生 `select` 保留键盘与浏览器可访问性，外层用绿色 pill 样式对齐当前运行按钮与状态风格；430px side panel 下保持 input 与 mode selector 同行，360px 以下才折行。原因：这是最小改动，能达到交互目标且不引入自定义 popover 状态复杂度。

**偏差说明**：没有实现完全自绘下拉菜单。原因：当前需求重点是布局和下拉选择形态，原生 select 更稳，也避免新增浮层定位和焦点管理风险。

**权衡分析**：
- 方案一：自定义 popover 菜单。优点是可完全复刻 Codex 菜单视觉；缺点是需要处理键盘、焦点、外部点击和 side panel 裁切。
- 方案二：原生 select + 自定义 pill 外观。优点是实现小、可访问性好、视觉接近；缺点是展开菜单由浏览器绘制，不能完全定制。
- 选择方案二，因为当前 Cockpit 是扩展 side panel，稳定和可访问性优先。

**验证记录**：
- `npx vitest run tests/node/ui/components/chat-panel.test.tsx tests/node/ui/styles/cockpit-css.test.ts`：3 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- Chrome for Testing SOP：430px side panel debug viewport 下 `rowColumns=235px 133px`、`sameLine=true`、`hasHorizontalOverflow=false`；截图位于 `/tmp/browser-helm-run-mode-select-430.png`。

**待确认**：
- [ ] 如果后续需要完全复刻 Codex 的浮层菜单，再单独设计自定义 menu 的键盘与焦点管理。

## [v0.4 Cockpit Run Mode 自绘菜单] - 2026-05-25

**目标**：修复 Run Mode 原生 select 展开后显示系统蓝色菜单、无法匹配 Cockpit 视觉风格的问题。

**设计决策**：用自绘 button + listbox 替代原生 select 展开菜单，保留右侧 pill 入口、键盘打开/关闭和外部点击关闭；菜单采用暖纸底、18px 圆角、柔和阴影、绿色选中态和勾选图标。原因：浏览器原生 option 弹层无法可靠定制样式，自绘菜单才能达到设计要求。

**偏差说明**：没有实现完整 roving focus。原因：当前菜单项数量固定且很少，本次先闭合视觉和选择交互；更完整的键盘焦点循环可后续单独补。

**权衡分析**：
- 方案一：继续使用原生 select。优点是浏览器可访问性完整；缺点是展开菜单样式不可控。
- 方案二：自绘 listbox。优点是视觉可控、与 Cockpit 风格一致；缺点是后续若强化键盘交互，需要补更多焦点管理。
- 选择方案二，因为用户明确要求展开框也要是带样式的菜单。

**验证记录**：
- `npx vitest run tests/node/ui/components/chat-panel.test.tsx tests/node/ui/styles/cockpit-css.test.ts`：4 tests passed。
- `npx eslint src/ui/components/chat-panel.tsx tests/node/ui/components/chat-panel.test.tsx`：passed。
- `npm run build`：passed。
- `npm run lint`：passed。
- `npm run typecheck`：passed。
- Chrome for Testing SOP：430px side panel debug viewport 下 `menuOpen=true`、`sameLine=true`、`hasHorizontalOverflow=false`、`menuBorderRadius=18px`、`selectedBackground=rgb(234, 248, 233)`；截图位于 `/tmp/browser-helm-run-mode-styled-menu-430.png`。

**待确认**：
- [ ] 是否需要为 Run Mode 菜单补 ArrowUp / ArrowDown 在选项之间移动焦点的完整 roving focus。

## [v1.0 Page Inspector / Form Doctor 发布收口] - 2026-05-25

**目标**：按 v1.0 roadmap 复查并补齐 Page Inspector + Form Doctor 的发布缺口，确保自动 mode 分类、真实 Page Inspector 浅层信号、ToolSelector 裁剪、DebugReport/findings、successCriteria finish guard 和真实扩展 E2E 验收闭环。

**设计决策**：`StartRunInput.mode` 改为可选；未显式选择 mode 时由 `TaskClassifier` / `resolveRunMode` 根据任务自动分类。Page health 作为 observation 的可选结构化字段进入 `bh_debug_collect_page_health`，由 DebugReport builder 生成 `Console error` / `Network failure` findings。ToolSelector 增加 active tab capability 与 no-form page state 裁剪。AgentLoop 在显式 `successCriteria` 存在但没有工具证据支撑时暂停，而不是接受模型直接 finish。

**偏差说明**：Chrome content script 不能可靠直接读取 page world 的 `window` expando；因此新增 content-side page health bridge 事件接收，并在 background ensure content script 时尝试安装 main-world console/fetch bridge。E2E 使用同一 bridge event 注入浅层 console signal，验证 content listener -> observation -> debug tool -> report -> UI 的真实扩展链路。

**权衡分析**：
- 方案一：只更新 roadmap checklist / E2E 断言。优点是改动少；缺点是自动 mode、Page Inspector 和 successCriteria 仍不符合 v1.0 发布定义。
- 方案二：补齐 runtime、page health、report、selector 和 AgentLoop guard。优点是按 AC 收口；缺点是涉及 agent/runtime/content/UI 测试多处。
- 选择方案二，因为用户要求完整完成 1.0 目标，并按项目 SOP 自证完成。

**验证记录**：
- `npx openspec validate implement-v1-0-page-inspector-form-doctor --strict`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：104 files / 401 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed，包含 v1 Form Doctor、v1 Page Inspector、approval boundary、content/runtime RPC 和 side panel 展示。

**待确认**：
- [ ] 后续若需要捕获页面加载早期 console/network，需要把 main-world bridge 做成更早注入的独立机制或 CDP/devtools 路径；v1.0 当前验证的是 BrowserHelm 安装 bridge 后的浅层信号。

## [Form Doctor 过滤隐藏上传字段] - 2026-05-25

**目标**：修复真实页面（如 X 首页）中隐藏 `input[type=file]` 被 Form Doctor 误判为真实可诊断表单字段的问题。

**设计决策**：Form Doctor 只读取可见字段；隐藏上传 primitive 仍可作为交互元素/动作目标候选存在，但不进入表单诊断字段列表。底层 `isVisibleElement` 同步识别 CSS class、父级隐藏、`aria-hidden`、`visibility:hidden/collapse` 和 `opacity:0`。

**偏差说明**：没有把 X 页面作为默认自动化 fixture。原因：项目 SOP 要求默认使用自有 fixture；本次用 DOM 行为测试复现隐藏上传控件，并用扩展 E2E 验证真实 runtime/content 链路不回退。

**权衡分析**：
- 方案一：仅排除 `input[type=file]`。优点是改动最小；缺点是会误伤真实可见上传字段，也无法处理其他隐藏字段。
- 方案二：按可见性过滤 Form Doctor 字段。优点是符合“真实可诊断字段”语义；缺点是依赖可见性判断质量。
- 选择方案二，因为 Form Doctor 是面向用户可见表单状态的只读诊断，不应报告页面内部隐藏控件。

**验证记录**：
- `npx vitest run tests/dom/page/dom/form-reader.test.ts`：7 tests passed。
- `npx vitest run tests/dom/page/a11y/element-state-reader.test.ts`：4 tests passed。
- `npx vitest run tests/dom/page/a11y/interactive-filter.test.ts tests/dom/page/a11y/element-state-reader.test.ts tests/dom/page/dom/form-reader.test.ts`：16 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 是否要为真实外部站点维护一份人工验收 checklist，专门记录 X/Gmail 等页面上的隐藏控件过滤预期。

## [v1.0.1 Agent Streaming Side Panel Roadmap] - 2026-05-25

**目标**：补充 v1.0.1 roadmap，定义 BrowserHelm side panel 从 v0.4 Cockpit 数据驾驶舱升级为单 Agent 聊天瀑布流、真实 streaming、精简 Debug 和模型配置弹窗的产品化版本。

**设计决策**：将 v1.0.1 定义为 v1.0 发布体验修正版本，而不是新能力大版本。默认 UI 不再暴露旧四个产品一级 Tab；Debug 只保留 Trace、工具、元素与表单、Streaming。Ref、交互元素和表单字段合成一张表。模型配置放到右上角三个点弹窗。真实 streaming 只承诺 OpenAI-compatible provider，并要求 fallback 到非流式完成模式。

**偏差说明**：原先讨论过“只改 UI 层”，但用户确认 v1.0.1 必须做真实 streaming，因此 roadmap 明确允许改 runtime、provider、snapshot schema 和 UI 层。同时补充“旧代码不用就删”的约束，避免隐藏旧 Cockpit 代码后长期维护两套信息架构。

**权衡分析**：
- 方案一：只做 UI 假流式。优点是风险低；缺点是 Agent 体感不真实，无法满足用户对本版本 streaming 的要求。
- 方案二：做完整多轮聊天和全 provider streaming。优点是能力完整；缺点是牵动会话系统、provider 抽象和长期状态，超出 v1.0.1。
- 方案三：做 OpenAI-compatible token/chunk streaming + 工具 event streaming + 可恢复 AgentMessage。优点是产品体感真实、边界可控；缺点是仍需改 runtime/provider/schema。
- 选择方案三，因为它能支撑 v1.0.1 的 Agent 产品体验，同时不给多轮聊天、memory 和 workflow replay 提前背债。

**待确认**：
- [ ] 实现前是否需要先为 v1.0.1 建 OpenSpec change。
- [ ] `animal-island-ui` 的发布授权边界是否满足 BrowserHelm 使用；若不满足，按 roadmap 切换为自写同风格组件。

## [v1.0.1 Agent Streaming Side Panel 实现收口] - 2026-05-26

**目标**：按 OpenSpec `implement-v1-0-1-agent-streaming-sidepanel` 完成 BrowserHelm v1.0.1：单 Agent 瀑布流、真实 OpenAI-compatible streaming、Debug 抽屉、模型配置弹窗、旧 Cockpit UI 删除、E2E 与 Chrome for Testing SOP 验收。

**设计决策**：默认产品面只保留 BrowserHelm header、AgentMessage waterfall、底部任务输入栏和右上角模型配置入口；Trace、工具、元素与表单、Streaming 迁移到“高级开发者选项”。`animal-island-ui` 用于 Button/Input/Switch/Modal/Tabs 等视觉组件，lucide 用作图标；`RunManager` 和 `RunSnapshot` 承载 `messages` / `streaming`，UI 不直接连接 Agent Kernel。

**偏差说明**：最初曾讨论“只动 UI 层”，但用户确认本版本必须做真实 streaming，因此本次同步修改 provider、runtime schema、RunManager、测试和 E2E。模型配置弹窗的连接测试只使用 mock/fake provider 或 runtime API，不在自动测试里打真实 provider。

**权衡分析**：
- 方案一：旧四 Tab 仅隐藏。优点是改动小；缺点是用户仍会面对两套信息架构，旧 CSS/测试会继续拖累维护。
- 方案二：删除旧一级 Tab、旧 Settings、旧 timeline/shell 组件，把有用能力迁入 Debug。优点是 v1.0.1 结构干净；缺点是 E2E/POM 和样式需要同步重写。
- 选择方案二，因为用户明确要求旧代码没用就删，且 v1.0.1 的产品面应像一个 Agent，而不是调试驾驶舱。

**验证记录**：
- `npx openspec validate implement-v1-0-1-agent-streaming-sidepanel --strict`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：103 files / 414 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。
- Chrome for Testing SOP：使用 debug side panel 430px viewport 截图验证默认态、Debug 展开态、模型配置弹窗；截图位于 `artifacts/v1.0.1-sidepanel-default.png`、`artifacts/v1.0.1-sidepanel-debug.png`、`artifacts/v1.0.1-sidepanel-model-config.png`。布局指标：`bodyScrollWidth=430`、`bodyClientWidth=430`、`panelScrollWidth=430`、`panelClientWidth=430`，未出现页面级横向溢出；旧 `BrowserHelm Cockpit` 标题和旧四 Tab 组合不存在。
- 旧代码清理 `rg`：`src` / `tests` 中无 `CockpitShell`、`PageObservationTab`、`RefMapTab`、`InteractiveElementsTab`、`FormFieldsTab`、`SettingsPanel`、`StepTimeline`、旧 cockpit CSS class 和旧标题残留。

**待确认**：
- [ ] `animal-island-ui@0.9.4` 当前 MIT，但 npm 描述为 learning purpose only；正式发版前是否需要额外做一次依赖合规确认。
- [ ] 后续是否把 implementation-notes 历史条目迁移到 `implementation-notes-archive.md`，让主文件回到 300 行上下。

## [v1.0.1 Agent Streaming Side Panel 闭环修复] - 2026-05-26

**目标**：修复 v1.0.1 审查中发现的产品闭环缺口：默认 side panel run 必须读取用户保存的 OpenAI-compatible provider 设置，真实 streaming delta 必须进入可恢复 `AgentMessage`，Debug Streaming 必须展示 provider/model/duration/final preview，刷新恢复不能重复创建 run，旧四 Tab 可达代码必须删除。

**设计决策**：`RunManager` 直接读取 `SettingsStore`，在页面观察/诊断完成后生成 provider 消息；streaming delta 每次更新同一条 `provider-response` 消息，并通过 `model_stream_*` trace 反推 `RunSnapshot.streaming`。Debug 抽屉不用 `animal-island-ui Tabs`，改为同风格的按钮式分段控件，避免 430px side panel 下 tab label 被压成竖排；视觉仍保留 animal-island-ui Button 和当前主题。

**偏差说明**：未把真实外部 provider 纳入自动测试，原因是不能依赖用户 key 或外部网络稳定性；自动化使用 fake `ModelClient` 验证真实 runtime 接线、delta 合并、fallback 决策和 secret 不落入 snapshot。Chrome for Testing SOP 验证的是真实 MV3 extension host、真实 content/runtime RPC 和 side panel 页面。

**权衡分析**：
- 方案一：继续让默认 run 只做 observe，用户手动进入 debug/form 才触发诊断。优点是改动少；缺点是 Agent 瀑布流没有真实模型闭环。
- 方案二：把 provider streaming 接到 Agent Kernel 多步循环。优点是架构统一；缺点是会牵动 tool decision JSON、工具循环和用户自然语言回复格式。
- 方案三：在 v1.0.1 的 `RunManager` 层生成面向用户的 provider response message，同时保留 Agent Kernel 诊断路径。优点是闭合产品体验、风险可控；缺点是后续多轮 Agent 需要再统一抽象。
- 选择方案三，因为 v1.0.1 要先兑现“像 Agent 一样流式回答”的首屏体验，长期多轮对话放到后续版本更稳。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：102 files / 412 tests passed。
- `npm run build`：passed。
- `npx openspec validate implement-v1-0-1-agent-streaming-sidepanel --strict`：passed。
- `npm run test:e2e`：15 passed，覆盖真实 MV3 扩展 host、content/runtime RPC、side panel、Debug 抽屉、Form Doctor、Page Inspector、approval 和 ref stale。
- Chrome for Testing SOP：重新截图验证 430px side panel，截图位于 `artifacts/v101-fixed-default.png`、`artifacts/v101-fixed-debug-streaming.png`、`artifacts/v101-fixed-model-config.png`。布局指标：`bodyScrollWidth=430`、`bodyClientWidth=430`、`panelScrollWidth=430`、`panelClientWidth=430`。

**待确认**：
- [ ] 后续多轮聊天版本是否把 `RunManager` provider response 合并回 Agent Kernel 的统一 message/event pipeline。

## [真实 Provider Streaming 验证修复] - 2026-05-26

**目标**：使用本地 `.env` 中的 OpenAI-compatible provider 配置验证 v1.0.1 默认 side panel run 的真实 streaming 链路，补齐自动测试无法覆盖的外部 provider 兼容性问题。

**设计决策**：保留默认跳过的 `RunManager` 真实 provider 集成测试，通过 `BROWSER_HELM_REAL_PROVIDER=1` 显式启用，避免普通 `npm test` 依赖外部网络或消耗真实额度。`OpenAICompatibleClient` 的默认 fetch 绑定到 `globalThis`，保证 Chrome extension service worker 中调用不会触发 `Illegal invocation`。SSE 流解析在 client 层增加跨网络 chunk 的行缓冲，避免 provider 把一条 JSON line 切成多段时误报 `Invalid stream JSON`。

**偏差说明**：真实 provider 测试读取 `.env`，但测试输出只报告 baseUrl、model、key 是否存在和 key 长度，不输出 key 内容。第一次探索命令曾把 `.env` 行内容带到终端输出；后续验证改为脚本脱敏输出。

**权衡分析**：
- 方案一：只修测试脚本，不改 client。优点是最小；缺点是 Chrome extension service worker 仍会真实失败。
- 方案二：把 DeepSeek 当特殊 provider 写分支。优点是能快速过；缺点是破坏 OpenAI-compatible 抽象。
- 方案三：修通用兼容性：JSON test prompt 明确包含 `JSON`，stream parser 支持跨 chunk buffering，fetch 绑定浏览器 global。
- 选择方案三，因为这些都是 OpenAI-compatible provider 和浏览器宿主的通用边界。

**验证记录**：
- 真实 provider 直连：`testConnection` 返回 `OK`；`streamComplete` 收到 12 chunks，返回中文确认文本。
- `BROWSER_HELM_REAL_PROVIDER=1 npx vitest run tests/node/runtime/run-manager-real-provider.test.ts --reporter=verbose`：1 test passed，真实 provider streaming 写入 `AgentMessage`，snapshot 不包含 API key。
- Chrome for Testing SOP + 真实 extension storage provider 配置：side panel 默认 run 真实生成页面回答；Debug Streaming 显示 `api.deepseek.com`、`deepseek-v4-flash`、`Chunk 33`、`耗时 1317ms`、`Fallback false`，页面无 API key、无“模型调用失败”。截图位于 `artifacts/v101-real-provider-sidepanel-final.png` 和 `artifacts/v101-real-provider-debug-streaming-final.png`。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：102 files passed / 1 skipped，414 tests passed / 1 skipped。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 是否要把真实 provider 测试命令加入 release checklist，但默认仍保持显式 opt-in。

## [v1.0.1 Review2 Streaming Fallback 与安全收口] - 2026-05-26

**目标**：修复第二轮审查发现的剩余 v1.0.1 闭环问题：streaming 失败必须 fallback 到 `complete()`、provider 生成中不能显示已完成、未配置 provider 时主瀑布流需要配置引导、Debug 元素与表单表需要 UI 层敏感语义兜底。

**设计决策**：streaming 路径先记录 `model_stream_failed`，再记录 fallback start/finish 并调用同一个 provider client 的 `complete(input)`；只有 complete fallback 也失败时才写入错误消息。provider 消息生成期间把 run status 暂时切到 `thinking`，完成或失败后恢复观察态。未配置 provider 时写入一条 `recommendation` 类型的 AgentMessage，而不是只静默关闭 streaming。Debug 合并表对 `field.sensitive` 以及 password/token/otp/api key 等字段语义统一显示为“敏感字段”，并隐藏敏感 ref/name/type/validation/submit reason。

**偏差说明**：敏感字段在 Debug 表中会牺牲一部分可调试信息，例如真实 field type/ref 展示；这是刻意选择，因为 v1.0.1 Debug 虽然只给高级开发者看，但仍在产品 UI 内，不应成为敏感字段泄露的第二通道。

**权衡分析**：
- 方案一：streaming 失败直接显示错误。优点是错误透明；缺点是不符合 v1.0.1 的 fallback 体验要求。
- 方案二：streaming 失败后静默重试 streaming。优点是可能保持流式；缺点是失败原因通常是 parser/network/provider，不适合立即重复。
- 方案三：记录 streaming 失败并 fallback 到 non-streaming complete。优点是用户仍能拿到回复，Debug 仍能看到失败和 fallback 轨迹。
- 选择方案三，因为它同时满足真实产品体验和高级调试可见性。

**验证记录**：
- `npx vitest run tests/node/runtime/run-manager.test.ts tests/node/ui/lib/merge-elements-forms.test.ts`：2 files / 17 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：103 files passed / 1 skipped，418 tests passed / 1 skipped。
- `npm run test:e2e`：15 passed。
- `BROWSER_HELM_REAL_PROVIDER=1 npx vitest run tests/node/runtime/run-manager-real-provider.test.ts --reporter=verbose`：1 passed。

**待确认**：
- [ ] 后续是否在 Debug 表中提供“显示敏感字段元信息”的临时本地开关；v1.0.1 默认不提供。

## [Apple 账号注册真实页面验证] - 2026-05-26

**目标**：用 Apple 官方账号注册页 `https://account.apple.com/account` 验证 BrowserHelm v1.0.1 在真实复杂页面上的默认观察、真实 provider streaming、Debug 元素与表单合并表和敏感字段防线。

**设计决策**：测试只做只读观察和截图，不输入真实个人信息、不提交表单、不创建账号。使用 Chrome for Testing / MV3 extension host，向临时 extension profile 写入本地 `.env` provider 配置，验证真实页面 + 真实 provider + 真实 side panel 路径。

**偏差说明**：Apple 页面包含 iframe/大型国家地区 select、验证码和隐私/营销复选框，Debug 表真实行数较多。首次验证发现敏感字段 masked ref 重复，且“新验证码”按钮仍暴露验证码语义；随后将 UI 层敏感遮罩扩展到普通 ref/interactive 行，并为敏感字段生成递增 masked ref。

**权衡分析**：
- 方案一：只遮罩表单字段。优点是保留更多调试信息；缺点是验证码刷新按钮、OTP 类普通交互元素仍可能泄露敏感语义。
- 方案二：Debug 表对 password/token/otp/captcha/api key 等语义统一遮罩，包含普通元素。优点是产品 UI 内安全边界一致；缺点是个别调试字段会变得不那么具体。
- 选择方案二，因为 Debug 虽然面向高级开发者，但仍不应成为敏感语义旁路。

**验证记录**：
- Apple 官方页面真实观察：`account.apple.com`，`ask / observed`，`元素 57`，`表单 12`，`警告 0`，`Streaming on`。
- 真实 provider streaming：无“模型调用失败”，无“生成中”残留，生成 Apple 账号注册页摘要。
- Debug 表：57 行，masked refs 为 `sensitive_ref_1` ...，无重复；清理掉 `敏感字段` / `敏感元素` / `sensitive_ref_*` 后，无 `api key/password/token/otp/captcha/验证码/密码/密钥/令牌` 命中。
- 截图：`artifacts/apple-account-real-final2-default.png`、`artifacts/apple-account-real-final2-elements.png`。
- `npx vitest run tests/node/ui/lib/merge-elements-forms.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：103 files passed / 1 skipped，418 tests passed / 1 skipped。
- `npm run test:e2e`：15 passed。
- `BROWSER_HELM_REAL_PROVIDER=1 npx vitest run tests/node/runtime/run-manager-real-provider.test.ts --reporter=verbose`：1 passed。

**待确认**：
- [ ] 后续是否增加一组手工/半自动真实站点验收清单，例如 Apple、GitHub、Google 登录/注册页，只做只读观察不提交。

## [v1.0.1 完成度审查缺口修复] - 2026-05-26

**目标**：补齐整体 review 中剩余的 v1.0.1 产品验收缺口：Trace 不再逐条刷 streaming delta，主瀑布流显示诊断证据和信心，side panel 提供可见的修改目标入口。

**设计决策**：TraceLog 在 UI 层把连续 `model_stream_delta` 聚合为一条 `model_stream_delta_summary`，保留 chunk 数、字符数和最后预览，避免 Debug Trace 被 token/chunk 刷屏。Agent 消息中的诊断卡展示 finding explanation、confidence 和最多两条 evidence summary，但不展示 `refId`，避免默认 UI 泄露调试 ref。修改目标复用已有 `RuntimePort.reviseGoal()`，放在 composer 上方的轻量操作条，不新增新的运行模型。

**偏差说明**：主瀑布流只显示证据摘要，不显示完整 evidence/ref/trace event；完整调试信息仍放在高级 Debug 内。修改目标入口目前只提交新的 goal，不在 UI 中单独编辑 successCriteria。新增证据摘要后，同一 finding 文案可能同时出现在摘要和标题中，因此 E2E Page Object 改为 exact 文案断言，避免 Playwright strict mode 被重复文本干扰。

**权衡分析**：
- 方案一：在 Trace 中完全隐藏 streaming delta。优点是最干净；缺点是 Debug 无法判断流是否持续到达。
- 方案二：保留所有 delta。优点是信息完整；缺点是不符合 v1.0.1 “不刷屏”的验收要求。
- 方案三：聚合连续 delta。优点是保留排障指标，同时保持 Trace 可读。
- 选择方案三，因为它同时满足开发者排障和产品验收。

**验证记录**：
- `npx vitest run tests/node/ui/components/timeline-inspector.test.tsx tests/node/ui/components/v101-agent-components.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/sidepanel/cockpit-app.test.tsx`：4 files / 19 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续是否给修改目标补 successCriteria 的 UI 输入；v1.0.1 当前只暴露 goal 修改。

## [Apple 真实表单 Agent 闭环修复] - 2026-05-26

**目标**：用 Apple 官方账号注册页和 `.env` 中真实 OpenAI-compatible provider 配置，验证并修复 v1.0.1 默认 Ask 与 v1.0.0 Form Doctor / Page Inspector 在真实表单页面上的 Agent 调用闭环。

**设计决策**：`form/debug` 模式在初始页面观察成功后，先生成 v1.0.0 兜底诊断 snapshot，并立即启动 provider response；后续异步 AgentLoop 诊断如果完成，只合并诊断字段和 trace，不覆盖当前 provider message / streaming 状态。新增 run 级别 `providerMessageRunIds` guard，防止 fallback 诊断和异步诊断都完成时重复生成模型回复。

**偏差说明**：真实 Apple 页面上，v1.0.0 诊断链可能长时间等待复杂页面 RPC 或调试工具，导致原实现一直不进入 provider。修复后 provider 会基于已可用的页面观察和 v1.0.0 兜底报告先给用户可见回复；更深的诊断结果作为增强数据补到 snapshot。

**权衡分析**：
- 方案一：继续等待异步诊断完成后再调用 provider。优点是模型上下文最完整；缺点是真实复杂页面会导致用户看不到 Agent 回复。
- 方案二：完全跳过异步诊断，只保留兜底报告。优点是快；缺点是削弱 v1.0.0 Form Doctor / Page Inspector 的诊断能力。
- 方案三：兜底报告触发 provider，异步诊断完成后增量合并且不重复 provider。
- 选择方案三，因为它保证真实产品闭环，同时保留 v1.0.0 诊断增强路径。

**验证记录**：
- Chrome for Testing / MV3 extension host / Apple 官方注册页 `https://account.apple.com/account` / `.env` 真实 provider：`ask`、`form`、`debug` 三个 run 都完成真实 streaming，均为 `account.apple.com`，页面标题 `创建你的 Apple 账户`，`refs=57`，`forms=12`，snapshot 不包含 API key。
- `ask`：provider message complete，`chunkCount=68`，生成 Apple 注册页摘要。
- `form`：`Form Doctor 诊断报告` + provider diagnosis complete，`chunkCount=30`，说明当前表单可填写。
- `debug`：`Page Inspector 诊断报告` + provider diagnosis complete，`chunkCount=88`，说明页面健康状态和潜在注意点。
- `npx vitest run tests/node/runtime/run-manager.test.ts tests/node/ui/lib/merge-elements-forms.test.ts --reporter=verbose`：2 files / 18 tests passed。
- `BROWSER_HELM_REAL_PROVIDER=1 npx vitest run tests/node/runtime/run-manager-real-provider.test.ts --reporter=verbose`：1 passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test -- --run`：103 files passed / 1 skipped，422 tests passed / 1 skipped。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续是否把 Apple 这类真实只读站点验收脚本沉淀成 release checklist，而不是纳入默认 CI。

## [v1.0.1 Composer 与模型配置细节修正] - 2026-05-26

**目标**：修正 v1.0.1 side panel 的两个产品细节：模型配置弹窗字段顺序改为 Base URL、Model、API Key；默认 composer 输入框为空，发送后清空输入内容。

**设计决策**：保留自动观察当前页面的内部任务文案，但不再把“观察当前页面”预填到用户输入框。用户主动发送时对任务做 `trim()`，空输入不启动 run；成功调用 runtime 后立即清空 composer，避免同一任务残留造成重复发送误解。

**偏差说明**：没有修改底层 provider 保存逻辑；API Key 仍可留空以复用已有 key。字段顺序只是 UI 呈现顺序调整。

**权衡分析**：
- 方案一：继续预填默认任务。优点是首屏看起来有内容；缺点是输入框不像真实聊天 composer，用户发送后也容易误以为还没发送。
- 方案二：输入框默认空，自动观察作为系统内部 run。优点是符合 Agent 聊天瀑布流心智；缺点是测试里需要显式输入任务。
- 选择方案二，因为 v1.0.1 的产品方向是 Agent 式输入，而不是表单式配置面板。

**验证记录**：
- `npx vitest run tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/components/v101-agent-components.test.tsx tests/node/ui/sidepanel/cockpit-app.test.tsx --reporter=verbose`：3 files / 17 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。

**待确认**：
- [ ] 是否需要把发送成功后清空输入同步到后续多轮聊天的消息 pending 状态展示。

## [v1.0.1 连续聊天与 Run Mode 菜单修复] - 2026-05-26

**目标**：修复 side panel 中用户多次发送后消息像新 run 一样回到顶部的问题，并修复窄面板下 Run Mode 下拉菜单向左溢出导致选项文字被裁切的样式问题。

**设计决策**：UI 层维护 `conversationMessages`，按 message id 合并每次 runtime snapshot 的消息；同一 run 的 streaming/provider message 会原位更新，不同 run 的用户消息和回复按首次出现顺序保留。Run Mode 菜单从 pill 左侧展开，宽度设为 `max(100%, 176px)`，mode pill 在窄面板下保持 124px 最小宽度，避免 `Debug/Form` 被容器裁切。

**偏差说明**：这仍是 v1.0.1 的单页会话流，不等同于完整多轮 Agent 记忆；runtime 每次发送仍创建独立 run，UI 只是把消息以聊天瀑布流方式连续展示。完整多轮上下文、历史持久化和 replay 仍留给后续版本。

**权衡分析**：
- 方案一：每次只展示当前 run。优点是状态简单；缺点是用户体验不像聊天，会看到新消息回到顶部。
- 方案二：UI 合并消息流。优点是改动小、符合当前 Agent 瀑布流体验；缺点是 runtime 层还不是完整会话。
- 方案三：立即重做 runtime 为多轮 conversation。优点是架构完整；缺点是超出本次样式和交互修复范围。
- 选择方案二，因为它先修正用户可见体验，同时不破坏当前 v1.0.1 run 边界。

**验证记录**：
- `npx vitest run tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/styles/cockpit-css.test.ts tests/node/ui/components/chat-panel.test.tsx --reporter=verbose`：3 files / 17 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**待确认**：
- [ ] 后续多轮聊天版本是否把 `conversationMessages` 下沉到 runtime session，并让 provider 获得历史上下文。

## [v1.0.1 Side Panel 用户摘要与自动观察修正] - 2026-05-26

**目标**：修正 side panel 自动打开时触发模型回复、页面摘要展示原始 visible text、设置按钮/停止按钮/高级开发者选项位置和 logo 不统一等用户体验问题。

**设计决策**：新增 `skipProviderResponse` 作为自动观察 run 的最小开关，侧边栏打开时仍做只读页面观察，但不生成 provider 回复；用户主动发送任务时保留模型回复。页面摘要改为确定性用户摘要，只展示标题、来源、页面状态和交互数量，原始 visible text 继续留在高级开发者数据里。使用 GPT Image 2 生成 BrowserHelm logo，并缩放为本地 256px 资产供 side panel 统一使用。

**偏差说明**：本次不重做 runtime 的持久页面快照缓存；自动打开仍会做一次只读 content RPC，以保证当前页面数据新鲜，但不会再请求 AI provider。

**权衡分析**：
- 方案一：完全取消打开侧边栏时的自动观察。优点是零请求；缺点是首屏没有当前页面上下文。
- 方案二：保留自动观察但跳过 provider。优点是首屏仍有只读页面状态，同时不会消耗 AI 调用；缺点是仍有一次本地 extension/content RPC。
- 选择方案二，因为用户问题集中在每次打开都请求 AI，而不是本地只读观察本身。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/ui/components/v101-agent-components.test.tsx`：2 files / 22 tests passed。
- `npm run test:e2e`：15 passed。
- Chrome for Testing / MV3 extension host / 本地 fixture：自动打开 side panel 无 provider guide、无模型失败、无停止按钮；页面摘要不包含原始 visible text；Run Mode 菜单在 390px 宽度内向上展开且未裁切；modal 与主面板均使用 animal cursor；截图为 `artifacts/v101-sidepanel-mode-menu-fix.png`、`artifacts/v101-sidepanel-summary-settings-fix.png`。

**待确认**：
- [ ] 是否需要把自动观察结果做 tab 级短时缓存，进一步减少每次打开 side panel 的 content RPC。

## [v1.0.1 自动观察与连续对话边界修正] - 2026-05-26

**目标**：修正用户第一次输入任务时，瀑布流把自动观察消息当作历史对话一并保留的问题。

**设计决策**：自动观察 snapshot 只更新当前页面状态，不写入 `conversationMessages`；用户主动发送任务时才开始持久合并消息。后续用户连续发送仍沿用既有合并逻辑，保留真正的连续对话历史。

**偏差说明**：本次只调整 UI 消息边界，不改变 runtime 每次任务仍创建独立 run 的事实；完整多轮上下文仍留给后续 conversation/session 设计。

**权衡分析**：
- 方案一：所有 snapshot 都合并。优点是实现简单；缺点是自动观察会污染第一句用户任务的历史。
- 方案二：自动观察不合并，用户主动任务才合并。优点是符合用户对“连续对话”的直觉；缺点是 UI 需要区分自动 run 和用户 run。
- 选择方案二，因为它直接修复当前可见问题，又不扩大 runtime 边界。

**验证记录**：
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/components/chat-panel.test.tsx`：2 files / 16 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续多轮 conversation/session 设计是否把用户消息历史下沉到 runtime，而不是仅由 UI 层合并。

## [v1.0.1 高级开发者入口移入右上角] - 2026-05-26

**目标**：将高级开发者选项从底部区域移到右上角，并通过 modal 弹出完整 Debug 内容。

**设计决策**：在 header actions 中新增 debug icon，放在 setting icon 左侧；原高级开发者面板抽出为 `AdvancedDebugPanel`，由 debug modal 复用，保留原 `AdvancedDebugDrawer` 以兼容组件级测试。modal 中继续提供 Trace、工具、元素与表单、Streaming 四个视图。

**偏差说明**：没有删除 `AdvancedDebugDrawer` 组件本身，因为已有组件测试仍覆盖折叠/展开逻辑；产品入口已改为右上角 modal。

**权衡分析**：
- 方案一：直接把 drawer DOM 移到 header 下方。优点是改动少；缺点是仍会占页面布局空间。
- 方案二：抽出 panel 并用 modal 承载。优点是符合右上角入口和弹窗要求；缺点是需要更新测试中对 portal 内容的断言位置。
- 选择方案二，因为它让高级内容成为按需打开的开发者工具，不再干扰主聊天体验。

**验证记录**：
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/components/v101-agent-components.test.tsx tests/node/ui/sidepanel/cockpit-app.test.tsx`：3 files / 19 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。
- Chrome for Testing / MV3 extension host：右上角 debug icon 位于 setting icon 左侧；底部无高级开发者 drawer；debug modal 显示 Trace / 工具 / 元素与表单 / Streaming。截图为 `artifacts/v101-debug-modal-header-icons.png`。

**待确认**：
- [ ] 后续是否给 debug modal 增加默认打开上次 tab 的持久化。

## [v1.0.1 Debug Modal Trace 与元素定位体验修正] - 2026-05-26

**目标**：优化高级开发者 modal 中 Trace、工具结果和元素与表单视图的可读性；支持点击元素记录后滚动并高亮目标页面元素；修复设置按钮 hover 时 cursor 未统一为 animal cursor 的问题。

**设计决策**：新增结构化 payload 组件替代 raw JSON `<pre>`，Trace 默认随 debug modal 打开并展示 key/value 结构。元素与表单视图从窄 modal 内的六列表格改为可点击列表卡片，通过 runtime 新增 `highlightRef` 消息转发到 content RPC 的 `A11Y_HIGHLIGHT_REF`，页面端只做 `scrollIntoView` 和临时高亮 class，不进入 agent 工具执行链与审批链。

**偏差说明**：敏感字段仍使用既有 `sensitive_ref_*` 脱敏 ref，不会尝试定位真实敏感输入。高亮属于调试 inspect 行为，不记录为 agent tool result，也不触发重新观察。

**权衡分析**：
- 方案一：在 UI 里直接复用工具调用 `bh_a11y_inspect`。优点是少加 runtime 消息；缺点是会污染 agent trace/tool result，并且不负责页面滚动高亮。
- 方案二：新增窄用途 runtime/content RPC。优点是交互职责清晰，支持 iframe composite ref；缺点是需要补一条 runtime 边界测试。
- 选择方案二，因为 debug UI inspect 是用户界面能力，不应伪装成 agent 行为。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/dom/page/messaging/content-rpc-handler.test.ts tests/node/runtime/background-runtime-host.test.ts tests/node/page/messaging/content-rpc-schema.test.ts`：4 files / 29 tests passed。
- `npm run test:e2e`：15 passed。
- Chrome for Testing / MV3 extension host / 本地 fixture：debug modal 默认 Trace；Trace 和工具详情无 raw `<pre>`；元素列表点击后目标页面出现 `.bh-page-ref-highlight` 并注入高亮样式；setting icon hover cursor 为 animal cursor。

**待确认**：
- [ ] 后续是否把敏感字段的“不可定位”状态在元素列表里显式标注出来。

## [v1.0.1 输入区暂停态与消息边界修正] - 2026-05-26

**目标**：修正底部输入区的完成 tag、发送/暂停按钮切换、hover cursor 统一、以及用户发送一句话时重复展示页面观察/页面摘要的问题。

**设计决策**：输入区不再展示 `RunStateBadge`；AI 回复或 runtime 处于思考中时，发送按钮整体替换为 `Pause` icon 按钮，点击仍走现有 cancel/stop runtime 语义。自动观察 run 继续显示首次进入的两条系统消息；用户主动 run 只保留用户任务、诊断或模型回复，不再把页面观察和页面摘要作为每次输入的显式消息。

**偏差说明**：Form/Debug 模式仍会把真正的诊断报告作为 Agent 消息展示。原因：诊断报告是用户任务结果，不属于“页面观察/摘要”的重复系统提示；同时 E2E 需要继续覆盖真实 runtime snapshot 的 Form Doctor 和 Page Inspector 报告。

**权衡分析**：
- 方案一：所有 runtime snapshot 都由 UI 自动派生页面摘要和诊断。优点是代码少；缺点是用户每次输入都会看到观察噪音。
- 方案二：runtime 显式控制消息类型，自动观察只发系统观察消息，用户 run 只发任务结果。优点是产品语义清楚；缺点是 runtime 需要为诊断报告补消息。
- 选择方案二，因为它能把“进入侧边栏的系统观察”和“用户连续对话”分开。

**验证记录**：
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/ui/components/v101-agent-components.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx`：3 files / 37 tests passed。
- `npm test -- --run`：103 passed / 1 skipped；429 passed / 1 skipped。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续若需要“暂停后继续生成”，应设计独立 resume 语义；当前暂停沿用 cancel/stop 语义。

## [v1.0.1 连续对话与 Provider 订阅刷新修复] - 2026-05-26

**目标**：修正用户发送消息后看不到 Agent 回复，以及首屏自动观察消息在第一轮聊天后消失的问题。

**设计决策**：Provider/config/fallback 写入 `RunSnapshot.messages` 后显式发送 `snapshot_updated` 订阅事件，确保 side panel 立即重新拉取 snapshot；自动观察首轮消息持久化到 waterfall 中，后续用户 run 继续追加用户和 Agent 消息，但不重复追加页面观察和页面摘要。

**偏差说明**：真实扩展调试使用本地 mock OpenAI-compatible provider；自动测试不依赖外部 provider key。调试时发现 `http://127.0.0.1` 会被 provider config policy 拦截，允许的本地调试地址应使用 `http://localhost`。

**权衡分析**：
- 方案一：让 UI 轮询 snapshot。优点是不用改 runtime 事件；缺点是浪费且仍可能有延迟。
- 方案二：runtime 在消息写入后补发轻量 `snapshot_updated`。优点是沿用现有订阅模型，UI 不需要轮询；缺点是该事件只表示快照已更新，不进入 trace。
- 选择方案二，因为问题本质是快照更新没有通知 UI，不是 UI 渲染能力不足。

**验证记录**：
- Chrome plugin：已连接用户 Chrome 并确认当前没有 BrowserHelm 扩展页可直接接管；随后按项目 SOP 使用 Chrome for Testing / MV3 extension host 调试。
- Chrome for Testing / MV3 extension host / 本地 fixture / mock provider：首屏显示 `已完成页面观察` + `页面摘要`；连续发送 `hello`、`second` 后消息顺序为两条系统消息、用户、Agent、用户、Agent；`page_summary` 计数保持 1；截图为 `artifacts/v101-chat-continuation-fixed.png` 和 `artifacts/v101-chat-continuation-second-message.png`。
- `npm test -- tests/node/runtime/run-manager.test.ts tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/components/v101-agent-components.test.tsx`：3 files / 39 tests passed。
- `npm test -- --run`：103 passed / 1 skipped；431 passed / 1 skipped。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续是否把 `snapshot_updated` 提升为正式 runtime event 常量，并在 RuntimePort 文档里明确其语义。

## [v1.0.1 未配置模型提示与后台观察隔离] - 2026-05-26

**目标**：修复未配置 API Key 时 Agent 回复样式像普通成功消息，以及用户输入后后台自动观察消息重新插入聊天流的问题。

**设计决策**：未配置 provider 时输出短文案 `请配置模型`，并用 recommendation 的黄色 warning 样式展示；聊天瀑布流只渲染 `conversationMessages`，`RunSnapshot` 仍更新页面/trace/debug 状态，但不会自动把非持久化的后台观察消息混入对话区。

**偏差说明**：保留用户每次发送时 runtime 侧的只读观察，因为 provider 回复仍需要最新页面状态；本次修的是 UI 消息流隔离，不是取消 runtime 的页面读取。

**权衡分析**：
- 方案一：停止用户 run 的页面观察。优点是不会再看到摘要；缺点是 Agent 回复会失去最新页面上下文。
- 方案二：保留页面观察，但只允许首屏自动观察和用户 run 消息进入聊天流。优点是上下文仍新鲜，UI 不再噪音；缺点是 UI 需要维护独立 conversation message 列表。
- 选择方案二，因为它匹配“开头两条系统消息，后面全是用户和 Agent 聊天”的交互要求。

**验证记录**：
- Chrome for Testing / MV3 extension host / 未配置 provider：连续发送 `123`、`213` 后消息顺序为首屏观察、首屏摘要、用户、`请配置模型` warning、用户、`请配置模型` warning；`page_summary` 计数保持 1，warning border 为 `rgb(243, 201, 120)`。截图为 `artifacts/v101-no-key-warning-chat.png`。
- `npm test -- tests/dom/page/observe/page-observation.test.ts tests/node/runtime/run-manager.test.ts tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/components/v101-agent-components.test.tsx tests/node/ui/components/chat-panel.test.tsx tests/node/ui/sidepanel/cockpit-app.test.tsx tests/node/ui/styles/cockpit-css.test.ts`：7 files / 50 tests passed。
- `npm test -- --run`：103 passed / 1 skipped；439 passed / 1 skipped。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 后续若要彻底避免用户 run 重读页面，需要新增页面观察缓存和失效策略，而不是直接跳过 observe。

## [v1.0.1 Header Icon Hover 样式修复] - 2026-05-26

**目标**：修复右上角 setting/debug 圆形 icon button hover 时仍被 `animal-island-ui` 默认按钮 hover 样式覆盖的问题。

**设计决策**：在 `.bh-agentSidePanel .bh-headerIconButton` 范围内显式覆盖 base/hover/focus/active 的背景、边框、阴影、文字色、transform 和 SVG stroke；保留 animal cursor，并用样式测试锁住 hover selector 与 cursor URL。原因：问题来自第三方默认 `.animal-btn-default:hover` 的高优先级视觉状态，必须在产品侧限定覆盖。

**偏差说明**：没有改 `animal-island-ui` 源码或引入新的 button 组件。原因：当前只需要修 BrowserHelm header icon 的产品样式，局部覆盖风险最低。

**权衡分析**：
- 方案一：替换为原生 button。优点是彻底绕开第三方 hover；缺点是会丢掉当前 Button 的尺寸和交互一致性。
- 方案二：保留 Button，增加局部高优先级覆盖。优点是改动小且只影响 header icon；缺点是需要测试防止后续 CSS 顺序回退。
- 选择方案二，因为它能精确修复 hover 问题，同时继续对齐现有 UI 库。

**验证记录**：
- `npm test -- tests/node/ui/styles/cockpit-css.test.ts`：1 file / 2 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- Chrome for Testing / MV3 extension host：hover `打开模型配置` button 后 computed style 为 `backgroundColor=rgb(255, 240, 207)`、`borderColor=rgb(217, 171, 86)`、`color=rgb(111, 67, 26)`、`transform=none`，cursor 为 animal cursor data URL；截图为 `artifacts/v101-setting-icon-hover-fixed.png`。

**待确认**：
- [ ] 如果后续继续出现第三方 Button hover 覆盖，可考虑抽一个 BrowserHelm 专用 `IconButton` 包装组件统一收口。

## [v1.0.1 Settings Icon Cursor 命中修复] - 2026-05-26

**目标**：修复用户反馈 settings icon 区域仍像默认鼠标、debug 区域才呈现动森 cursor 的问题。

**设计决策**：在 header actions 和 header icon button 的 icon wrapper 上显式设置动森 cursor，并让 header icon 内的 SVG `pointer-events: none`。原因：真实扩展检查发现 settings 命中点会落到 `svg` 子节点；虽然 computed cursor 已是动森图，但让 SVG 不接管 pointer event 后，鼠标命中稳定落在外层 button/icon wrapper，避免浏览器对 SVG 子节点 cursor 命中差异。

**偏差说明**：未替换 settings 的 lucide 图标。原因：本次问题是 cursor 命中而不是图标语义；右上角仍保留 settings 图标作为模型配置入口。

**验证记录**：
- `npm test -- tests/node/ui/styles/cockpit-css.test.ts`：1 file / 2 tests passed。
- `npm run lint`：passed。
- `npm run typecheck`：passed。
- `npm run debug:extension`：真实 Chrome for Testing / MV3 extension host 加载成功；hover `打开模型配置` 后命中顶层从 `svg` 变为 `.animal-btn-icon-P5CS9`，`svgPointerEvents=none`，button/top cursor 均为动森 cursor data URL；截图为 `artifacts/v101-settings-cursor-hit-fixed.png`。

**待确认**：
- [ ] 如果原生 Chrome side panel 仍显示旧 cursor，需要确认是否在看旧的未重载扩展会话。

## [v1.0.1 Review Findings 修复] - 2026-05-26

**目标**：修复 review 中确认的问题：有 landmark 时漏掉正文文本、流式消息内容增长时不继续滚到底部、所有链接都被归为导航导致页面结构统计失真，并清理 `BrowerHelm` placeholder 拼写残留。

**设计决策**：visible text 继续按 landmark 分段，但额外采样非 landmark 正文 remainder；交互元素采集阶段写入 `pageZone`，由 DOM ancestor 判断真实 nav/form/content/other，再让 ranker 与 structured summary 优先使用该字段；消息列表滚动锚点从 `messages.length` 改为包含最后内容增长特征的消息签名。

**偏差说明**：未重做完整页面摘要算法。原因：当前先修确认的回退 bug，保留现有摘要预算和展示结构，避免扩大行为面。

**权衡分析**：
- 方案一：只调大 visible text 预算。优点是改动小；缺点是仍会被 nav/header 抢占正文。
- 方案二：landmark + 非 landmark remainder 同时采样。优点是不丢正文，仍能保持结构化摘要；缺点是极长页面仍需要后续更精细的内容排序。
- 选择方案二，因为它直接修复真实页面“只有导航没有正文”的主要问题。

**验证记录**：
- `npm test -- tests/dom/page/observe/page-observation.test.ts tests/node/page/a11y/interactive-ranker.test.ts tests/dom/page/structured/structured-page-data.test.ts tests/node/ui/components/v101-agent-components.test.tsx tests/node/shared/schemas/observation.test.ts tests/node/shared/schemas/structured-page-data.test.ts`：6 files / 40 tests passed。
- `npm run lint`：passed。
- `npm run typecheck`：passed。
- `npm run build`：passed。

**待确认**：
- [ ] 后续是否把 `pageZone` 暴露到 Debug 元素列表中，帮助用户理解为什么某个元素被归类为导航/正文/表单。

## [安全与隐私 Review 属实项收口] - 2026-05-26

**目标**：修复 review 中确认属实的安全/隐私和维护性问题，包括静态 iframe action token、provider 上下文泄露、trace providerBaseUrl、Markdown 全局副作用、脱敏规则过宽、重复实现、iframe ref 默认值不一致和 settings policy 占位文案不清晰。

**设计决策**：iframe mutation 改为 content script 内生成一次性 action grant，工具在 readiness 通过后先申请 `BH_IFRAME_ACTION_AUTHORIZE`，再携带该 token 执行 click/type；token 绑定 refId 和 action，成功使用后立即消费。provider prompt 只发送页面标题、domain、确定性摘要和结构化摘要，不再发送完整 URL path/query/hash。providerBaseUrl 不再写入 AgentLoop trace。

**偏差说明**：本次没有引入第三方 sanitizer。原因：当前 Markdown sanitizer 已有 allowlist 和属性清理，本轮先消除 `marked.setOptions` 全局副作用，并保留现有 XSS 回归测试；是否替换为成熟 sanitizer 可作为后续独立安全任务评估。

**权衡分析**：
- 方案一：继续使用静态 token，只加强 content handler readiness。优点是改动少；缺点是源码可见 token 仍然是长期共享秘密。
- 方案二：引入一次性 action grant。优点是消除静态秘密和重放风险；缺点是每次 iframe mutation 多一次 content RPC。
- 选择方案二，因为 iframe click/type 是页面 mutation 入口，值得用一次额外 RPC 换取更清晰的授权边界。

**验证记录**：
- `npx vitest run tests/dom/page/messaging/content-rpc-handler.test.ts tests/node/page/messaging/content-rpc-schema.test.ts tests/node/tools/frame/iframe-tools.test.ts tests/node/shared/redaction.test.ts tests/node/agent/kernel/agent-loop.test.ts tests/node/runtime/run-manager.test.ts tests/node/agent/model/streaming-parser.test.ts tests/node/agent/model/open-ai-compatible-client.test.ts tests/node/ui/components/v101-agent-components.test.tsx`：9 files / 85 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：104 passed / 1 skipped；450 passed / 1 skipped。
- `npm run build`：passed。
- `npm run test:e2e`：15 passed。

**待确认**：
- [ ] 是否在后续版本引入成熟 HTML sanitizer 替代自定义 Markdown allowlist。
- [ ] provider prompt 是否需要用户可配置的“发送页面上下文”开关。

## [v1.0 Diagnostics Review 属实项收口] - 2026-05-26

**目标**：修复 v1.0 Diagnostics review 中确认属实的问题：注册 `PAGE_CHANGED` / `ELEMENT_NOT_FOUND` 错误码，并补齐 runtime diagnostic model client、store-core、risk-labels 的直接测试。

**设计决策**：保留 `ELEMENT_NOT_FOUND` 与 `REF_NOT_FOUND` 两个错误码。`REF_NOT_FOUND` 表示 BrowserHelm ref 映射层找不到 ref；`ELEMENT_NOT_FOUND` 表示 recovery/plan 语义里的目标 DOM 元素不存在，需要查找替代元素。原因：两者触发层不同，分开注册比复用 `REF_NOT_FOUND` 更能表达 v1.0 recovery 设计。

**偏差说明**：没有修改 RecoveryPolicy 的字符串比较为 `ERROR_CODES.*`。原因：当前先补错误码注册与测试缺口；是否统一 recovery/planning 内所有错误码引用形式可另做一次机械收敛。

**权衡分析**：
- 方案一：删除 `ELEMENT_NOT_FOUND`，全部复用 `REF_NOT_FOUND`。优点是错误码更少；缺点是 recovery 语义变窄，和 v1.0 设计文档不一致。
- 方案二：注册两个设计要求的错误码，并用描述区分 ref 映射层和 DOM 目标层。优点是保留设计语义和类型入口；缺点是需要维护两个相近错误码。
- 选择方案二，因为 v1.0 design/spec 已明确列出 `ELEMENT_NOT_FOUND` 和 `PAGE_CHANGED` recovery 路径。

**验证记录**：
- `npx vitest run tests/node/shared/schemas/observation.test.ts tests/node/runtime/runtime-diagnostic-model-client.test.ts tests/node/ui/stores/store-core.test.ts tests/node/ui/lib/risk-labels.test.ts tests/node/agent/recovery/recovery-policy.test.ts`：5 files / 13 tests passed。

**待确认**：
- [ ] 后续是否统一 recovery/planning 内的错误码引用为 `ERROR_CODES.*`，减少字符串散落。

## [Approval Result 语义化展示] - 2026-05-26

**目标**：修复 review 中 P2-13 指出的 `approvalResult.code` 裸 `<p>` 渲染问题。

**设计决策**：保留审批结果可见反馈，但改成 `.bh-approvalResult` + `role="status"` 的语义化状态提示，并使用琥珀警告色样式。原因：React 文本渲染本身不构成 XSS，但裸 code 段落语义弱、样式不统一。

**偏差说明**：没有改 AgentLoop 的 preflight policy。原因：当前 high-risk 已在 AgentLoop 执行前按 tool risk 预检；参数级 readiness preflight 需要新的 `ToolRouter.preflight()` 架构，不适合作为小 bug 修。

**验证记录**：
- `npx vitest run tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/ui/styles/cockpit-css.test.ts`：2 files / 17 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**待确认**：
- [ ] 后续若要做 AgentLoop 参数级审批预检，需要单独设计 ToolRouter preflight 契约。
