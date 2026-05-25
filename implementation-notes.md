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
