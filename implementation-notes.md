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

## [v0.33 Safe Action Readiness 实现] - 2026-05-25

**目标**：实现动作准备状态、`动作准备 / Act` run mode、iframe read/click/type 受控原型、最小 approval runtime hook，并补齐全部 `bh_` 工具头部 TSDoc/JSDoc 注释。

**设计决策**：选择把 Action Readiness 做成纯 DOM/page 能力，再由 `bh_action_check_readiness` 和 iframe click/type 强制复用。原因：安全检查不能只依赖模型主动调用；会修改页面的 iframe action 必须在工具内部先做 ref freshness、元素状态、风险和 approval 判断。

**偏差说明**：原 roadmap 写“本阶段不实际修改页面”，本期根据用户确认引入了 iframe click/type prototype。偏差被限制在 `src/tools/frame/` 和 content RPC target-frame 链路内，且继续明确不做 `iframe_submit`、普通页面完整 click/type/nav、自动填表和完整 approval UI。

**权衡分析**：
- 方案一：只实现 readiness 与 `bh_iframe_read`。优点是范围最窄；缺点是无法验证 `changedPage/requiresObserve`、mask preview 和 approval 阻断在真实 mutating tool 中是否成立。
- 方案二：增加 iframe read/click/type 受控原型。优点是能验证跨 frame 路由、动作前检查、敏感输入和 stale ref；缺点是 v0.33 范围扩大。
- 选择方案二，因为 iframe 是当前真实网页的关键结构，且 click/type 仍受 Act mode、readiness 和 approval policy 约束，不进入 submit。

**roadmap 验收对照**：
- AC1-AC3：`checkActionReadiness` 覆盖有效 ref、stale ref、不可见、disabled、动作类型不匹配和 page change `requiresObserve`。
- AC4-AC6：ApprovalRequest/ApprovalDecision/ApprovalManager、`waiting_for_approval`、approve resume、deny `USER_DENIED_APPROVAL`、approval audit/trace 事件已覆盖。
- AC7：完整 `npm test` 与 E2E 回归通过。
- AC8：主要改动落在 proposal 约定目录；额外触及 `src/entrypoints/sidepanel`、`src/background/runtime`、`tests/e2e` 与 roadmap/docs，是 Act 文案、runtime snapshot 和验收所需。
- AC9-AC12：roadmap 已同步 Act 双语、iframe prototype、`iframe_submit` non-goal 和工具注释治理；工具文档结构测试覆盖全部 21 个 `bh_` 工具。

**验证记录**：
- `npx vitest run ...` action/frame/approval/tool schema 相关组合：18 files / 127 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：74 files / 282 tests passed。
- `npm run build`：Chrome MV3 extension build passed。
- `npm run test:e2e`：9 tests passed，真实 Chrome for Testing / unpacked extension / iframe fixtures；新增 act mode iframe read/click/type 链路通过。
- `npx openspec validate implement-v0-33-safe-action-readiness --strict`：passed。

**待确认**：
- [ ] 进入 submit 类动作时，需提醒用户单独确认 `iframe_submit` / `bh_form_submit_with_approval` 是否作为独立工具、是否复用同一 approval UI、以及 submit 前 verify 边界。
- [ ] v0.4 Approval UI 采用 modal、drawer 还是 timeline inspector 仍待设计确认。

### Review 修复 - 2026-05-25

**目标**：补齐 v0.33 验收 review 指出的真实 runtime 闭环缺口：runtime tool execution、approval approve/deny API、以及 iframe tool 的 extension E2E 链路。

**设计决策**：选择在 `RunManager` 中新增 `executeTool` / `decideApproval` 最小 API，并通过 `BackgroundRuntimeHost` 暴露 `BH_RUNTIME_EXECUTE_TOOL` / `BH_RUNTIME_DECIDE_APPROVAL`。原因：v0.33 仍不做完整 Action UI，但必须让 background runtime 能真实调用 ToolRouter、创建 ApprovalRequest、处理 deny/approve 并更新 snapshot。

**偏差说明**：approve 后本期只恢复 run 到可继续状态，不自动 replay/执行高风险动作。原因：v0.33 non-goal 仍是不做完整 approval UI、workflow replay 和 submit；后续 v0.4/v1.1 再决定批准后是否自动继续执行对应 action。

**验证记录**：
- `npx vitest run tests/node/runtime/run-manager.test.ts tests/node/runtime/background-runtime-host.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：75 files / 286 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：10 tests passed；新增 E2E 通过 `BH_RUNTIME_EXECUTE_TOOL` 调用 `bh_iframe_read/click/type`，并通过 `BH_RUNTIME_DECIDE_APPROVAL` 验证 high-risk iframe tool deny 后 `USER_DENIED_APPROVAL` 且页面未修改。
- `npx openspec validate implement-v0-33-safe-action-readiness --strict`：passed。

### Security Review 修复 - 2026-05-25

**目标**：修复二次 review 指出的安全边界缺口：iframe type 敏感文本泄漏、裸 content RPC 可绕过工具层、policy/approval 判断分叉、敏感字段识别信号不足、Act mode 工具可见性偏宽。

**设计决策**：选择增加统一 `redactToolArgs`，并把 AgentLoop trace、model decision trace、approval request、RunManager pending approval 都改为记录 redacted args。iframe click/type 的 content RPC 增加 runtime action token，工具层保留真实 text 执行但 preview/trace 只保留 `valuePreview`。

**偏差说明**：本期仍不实现完整 approval UI 或 approve 后自动 replay；approve 只恢复到可继续状态。原因：v0.33 的目标是安全 readiness/runtime contract，完整人机审批界面留给 v0.4。

**权衡分析**：
- 方案一：只在 `bh_iframe_type` 工具内部 mask。优点是改动少；缺点是 AgentLoop、runtime approval、session trace 仍可能从上游 raw args 泄漏。
- 方案二：在 trace/approval 入口统一 redaction，并让 content RPC 也具备最小授权守卫。优点是防线覆盖工具前、工具后和裸 RPC；缺点是需要多层测试。
- 选择方案二，因为敏感值治理和页面 mutation 边界必须按 runtime 入口统一处理。

**验证记录**：
- `npx vitest run tests/node/agent/kernel/agent-loop.test.ts tests/node/runtime/run-manager.test.ts tests/dom/page/messaging/content-rpc-handler.test.ts tests/node/tools/frame/iframe-tools.test.ts tests/dom/page/dom/action-readiness.test.ts tests/node/tools/core/tool-router.test.ts tests/node/agent/policy/policy-engine.test.ts`：44 tests passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：74 files / 289 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：10 tests passed，真实 Chrome for Testing / unpacked extension / iframe fixtures。
- `npx openspec validate implement-v0-33-safe-action-readiness --strict`：passed。

## [v0.31/v0.32 Structured Interactions 实现] - 2026-05-24

**目标**：实现 v0.31 交互元素只读识别与 v0.32 表单字段只读诊断，并接入 Run Mode Gate、Structured Page Data、工具层和 side panel 最小 UI。

**设计决策**：选择在 observation 阶段生成 interactive/form 只读快照，再由 `StructuredPageData` 做确定性 tab summary。原因：content script 已持有真实 DOM 和 ref map，能避免 background/UI 重复解析页面；Agent context 只接收裁剪摘要，不暴露完整字段值。

**偏差说明**：未新增独立 form content RPC，v0.32 表单工具通过 `BH_PAGE_OBSERVE` 读取 observation 中的 `formFields` 快照。原因：当前工具均为只读诊断，复用 observation 能保持 runtime 边界简单；后续若需要按 ref 增量读取，再拆独立 RPC。

**权衡分析**：
- 方案一：表单工具复用 `BH_PAGE_OBSERVE`。优点是少一条 RPC、trace/context 一致；缺点是每次工具调用会读取完整 observation。
- 方案二：新增 `BH_FORM_READ_FIELDS` 等细粒度 RPC。优点是语义更细；缺点是当前阶段会放大 content/runtime 协议面。
- 选择方案一，因为 v0.31/v0.32 是只读识别与诊断，优先保证一致性和最小协议面。

**roadmap 验收对照**：
- v0.31 AC1-AC4：交互元素列表、`refId/role/name/state`、`visible/disabled/checked/selected` 和 UI 列表/基础详情已覆盖。
- v0.31 AC5：`npm test`、ref map DOM 回归和 E2E 均通过，v0.2/v0.3 外壳保持兼容。
- v0.31 AC6：目录落在 proposal 约定范围内；额外触及 `src/runtime`、`src/background/runtime`、`src/entrypoints/sidepanel` 是 Run Mode Gate 和 UI 验收所需。
- v0.31 AC7：side panel 最小交互元素 tab 通过 SSR UI 测试，并用 Chrome for Testing debug SOP 验证扩展可加载真实 fixture。
- v0.32 AC1-AC4：字段、必填、校验、disabled submit reason、敏感字段 mask 和 `refId` 绑定已覆盖。
- v0.32 AC5：v0.31 interactive 在 v0.32 接入后通过结构化回归测试保持兼容。
- v0.32 AC6：目录落在 proposal 约定范围内；同上，runtime/UI 触及属于本 change 明确影响面。
- v0.32 AC7：side panel 最小表单字段 tab 通过 SSR UI 测试，并用 Chrome for Testing debug SOP 验证真实 HTML fixture。

**验证记录**：
- `npm test`：59 files / 169 tests passed。
- `npm run build`：Chrome MV3 extension build passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run test:e2e`：6 tests passed，真实 Chrome for Testing / unpacked extension / fixture pages。
- `npx openspec validate implement-v0-31-v0-32-structured-interactions --strict`：passed。
- 真实 HTML SOP：`BROWSER_HELM_DEBUG_EXIT_AFTER_READY=1 BROWSER_HELM_DEBUG_FIXTURE=v0-32-form-complete.html npm run debug:extension`，Chrome for Testing 成功加载 `.output/chrome-mv3`、目标页 `v0-32-form-complete.html` 和 side panel debug page。

**待确认**：
- [ ] 后续 v0.33 是否把 `FormSubmitSummary.refId` 从 DOM id 升级为 submit button stable ref。
- [ ] 后续是否拆出细粒度 form content RPC，减少表单工具调用时的 observation 重读。

## 历史细节归档

历史执行细节、命令输出、逐项验证记录与每条待确认的原始版本，见  
[`implementation-notes-archive.md`](implementation-notes-archive.md)。

## [v0.31/v0.32 review 收口修复] - 2026-05-24

**目标**：修复 code review 发现的 0.31/0.32 契约缺口，保证单元素状态读取、submit disabled reason 和 submit ref 绑定与 spec 一致。

**设计决策**：选择在 `resolveRef` 真实 RPC 链路补齐 `checked/selected` 状态，而不是只在工具层拼装默认值。原因：状态应来自当前 DOM 的同一事实源，避免 mock 测试与真实 content RPC 行为继续分叉。

**偏差说明**：将 `confirmed` disabled submit reason 从 `aria-label` 改为字段级直接校验证据（如 `validationMessage`）。原因：按钮 accessible name 不是禁用原因，继续使用会把名称误报成页面事实。

**权衡分析**：
- 方案一：在 submit summary 中继续保存 DOM `id`。优点是实现简单；缺点是无法复用 stable ref 生命周期，且无 `id` 按钮无法被后续工具引用。
- 方案二：在 submit summary 中注册并返回 stable `refId`。优点是与 v0.2 ref 边界一致；缺点是表单读取阶段需要额外触碰 submit 元素。
- 选择方案二，因为 v0.31/v0.32 后续工具和 UI 都依赖统一的 stable ref 语义。

**待确认**：
- [ ] 是否需要把 `bh_a11y_resolve_ref` 的 schema 也显式收紧为包含 `checked/selected` 的 resolved-ref 契约，而不是继续使用宽松 `z.unknown()` 响应边界。

## [Apple 账号页 iframe 表单识别修复] - 2026-05-24

**目标**：修复 `https://account.apple.com/account` 上 Ref 映射只返回少量顶层元素、表单字段为空的问题。

**设计决策**：选择让 content script 注入所有 frame，并由 background 侧 `ChromeContentRpcClient` 通过 `chrome.webNavigation.getAllFrames` 逐 frame 请求 observation/snapshot 后合并。原因：Apple 创建账号表单位于 `account.apple.com` 顶层页面内的 `appleid.apple.com` 跨域 iframe，顶层 DOM 观察无法读取真实字段。

**偏差说明**：合并后的表单字段会同时包含顶层页面搜索/导航相关字段和 iframe 内账号字段。原因：当前 v0.31/v0.32 的语义是“页面只读识别”，尚未加入“主任务表单”聚焦策略；后续可以在 Form Mode 中增加表单分组或主表单优先排序。

**权衡分析**：
- 方案一：只在页面层手工追踪特定 Apple iframe。优点是短期简单；缺点是站点特化，无法覆盖通用 iframe 表单。
- 方案二：所有 frame 通用注入与聚合，非顶层 ref 使用 `frame_<id>:ref_<id>` 前缀。优点是通用、可测试、后续 resolveRef 可路由回对应 frame；缺点是 UI 需要接受跨 frame refId。
- 选择方案二，因为 iframe 表单是通用网页结构问题，不应做站点特判。

**验证记录**：
- 真实外部站点：Chrome for Testing 加载 `https://account.apple.com/account`，确认表单 iframe 为 `https://appleid.apple.com/widget/account/...`，iframe 内有 13 个 input、5 个 select、5 个 button。
- 真实扩展链路：side panel debug page 对 Apple 页运行 `BH_RUNTIME_START_RUN`，结果为 `snapshotStatus=observed`、`refCount=57`、`formsStatus=ready`、`formsCount=19`，UI 表单字段表可见 `frame_3:ref_102` 姓氏、`frame_3:ref_103` 名字、`frame_3:ref_104` 国家或地区等字段。
- 本地回归：新增 iframe 表单 fixture 与 E2E，用 side panel runtime 验证 iframe 内字段以 `frame_<id>:ref_<id>` 形式进入 refs 和 forms。
- `npm test -- tests/dom/page/a11y/interactive-filter.test.ts tests/node/page/messaging/content-rpc-client.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed，manifest 已包含 `content_scripts[].all_frames=true` 与 `webNavigation` 权限。
- `npm run test:e2e`：7 tests passed。

**待确认**：
- [ ] Form Mode 是否要把 iframe 内“主账号表单”排在顶层 Apple 搜索字段之前，或按 form/iframe 分组展示。

## [工具注册与常量治理重构] - 2026-05-24

**目标**：将 content RPC 分发改为策略模式，工具注册改为构建期自动收集，并把错误码、事件名/消息名集中到常量目录维护。

**设计决策**：选择 `import.meta.glob('./**/bh-*.ts', { eager: true })` 做工具 catalog，而不是运行时读取文件系统。原因：BrowserHelm 运行在 MV3 扩展环境，不能依赖 Node 文件系统；Vite/WXT 构建期 glob 可以自动引入所有 `bh-` 工具模块，同时保留浏览器端可打包性。

**偏差说明**：错误码仍保持对外字符串 code，新增 `ERROR_CODE_DEFINITIONS` 和 `ERROR_CODE_NUMBERS` 做数字顺序维护。原因：现有 trace、ToolResult、UI 和测试已使用字符串 code 作为稳定契约；直接替换为纯数字会破坏当前协议。

**权衡分析**：
- 方案一：手写 barrel export 并继续逐个注册。优点是显式；缺点是新增工具仍要改 registry，容易遗漏。
- 方案二：构建期 glob 扫描所有 `src/tools/**/bh-*.ts`，自动识别 ToolSpec 或 ToolSpec factory。优点是新增工具只需落文件；缺点是工具模块导出必须保持规范。
- 选择方案二，因为用户目标是“遍历目录全部然后引入”，且该方式符合 WXT 构建边界。

**验证记录**：
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：60 files / 172 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：7 tests passed。
- 真实外部站点复验：Chrome for Testing 加载 `https://account.apple.com/account`，策略化 content RPC 后仍返回 `refCount=57`、`formsStatus=ready`、`formsCount=19`，首个 iframe 字段为 `frame_3:ref_102` / 姓氏。

**待确认**：
- [ ] 是否要进一步把测试里的字符串断言也改为引用常量，降低后续错误码改名成本。

## [动态 iframe 表单加载刷新修复] - 2026-05-24

**目标**：修复页面初始化时 iframe 或表单仍在 loading，side panel 首次 observation 过早导致 refs/forms 为空的问题。

**设计决策**：选择在 side panel 初始化、tab 更新和 frame navigation 后安排多次短窗口 settle refresh，而不是只依赖一次 `DOMContentLoaded` 或手动刷新。原因：Apple 账号页这类页面会先完成外层文档加载，再由 iframe 内脚本异步渲染真实表单。

**偏差说明**：未引入 content script 主动推送 DOM mutation 事件。原因：当前 observation 仍是只读拉取模型，多次 settle refresh 已覆盖 v0.32 验收场景；后续若需要更实时的 Cockpit UI，再引入 mutation-driven invalidation。

**权衡分析**：
- 方案一：只在页面 load 完成后刷新一次。优点是实现简单；缺点是无法覆盖 iframe 内二次渲染。
- 方案二：在初始化和 frame navigation 后做 bounded retry refresh。优点是无需页面特判，能覆盖 loading 后表单出现；缺点是短时间内会多发几次只读 observation。
- 选择方案二，因为它和 WebBrain/BrowserKing 对跨域 iframe 的通用注入思路兼容，同时比固定 sleep 更可控。

**验证记录**：
- `npm run test:e2e -- tests/e2e/specs/extension/page-observation.spec.ts --grep "delayed iframe"`：passed，真实 Chrome for Testing / unpacked extension / 延迟 iframe fixture。
- `npm run typecheck`：passed。
- `npm run lint`：passed。

**待确认**：
- [ ] 后续 Cockpit UI 是否要升级为 content script mutation-driven refresh，以减少 settle refresh 的重复读取。

## [iframe 聚合健壮性对齐 WebBrain/BrowserKing] - 2026-05-24

**目标**：对照 WebBrain 与 BrowserKing 的 iframe 处理方式，增强 BrowserHelm 在部分 iframe 不可达时的 observation 可用性和排障信息。

**设计决策**：选择让 all-frame observation/snapshot 对单个 frame 消息失败做 per-frame 容错，并在 warning 中保留 `frameId + frame URL + error code`。原因：WebBrain 的 allFrames executeScript 是逐 frame 返回结果，BrowserKing 的 all_frames a11y 脚本也是分 frame 注入；真实页面中某些 frame 可能还未注入、正在导航或被浏览器限制，不应导致顶层和其他 iframe 的数据全部丢失。

**偏差说明**：未新增独立 `iframe_read/click/type` 工具。原因：BrowserHelm 当前 v0.31/v0.32 仍是只读 observation/ref/form 诊断，动作类 iframe 工具属于 v0.33+ Action Readiness 后再评估；现在先把通用 observation 聚合做稳。

**权衡分析**：
- 方案一：保持 `Promise.all` 直接抛错。优点是实现简单；缺点是一个 frame 失败会放大成整页 observation 失败。
- 方案二：每个 frame 单独捕获失败并合并 warning。优点是可保留部分可用数据并暴露失败 frame URL；缺点是调用方需要查看 warning 判断是否 partial。
- 选择方案二，因为这更符合开源项目里“跨域 iframe 按 frame 逐个处理”的成熟模式。

**验证记录**：
- `npx vitest run tests/node/page/messaging/content-rpc-client.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run test:e2e -- tests/e2e/specs/extension/page-observation.spec.ts --grep "iframe|delayed iframe"`：2 tests passed，真实 Chrome for Testing / unpacked extension / iframe fixtures。

**待确认**：
- [ ] 是否在 v0.33+ 增加独立 iframe 工具（如只读 `bh_frame_list` / `bh_frame_read`），供 Debug/Form mode 显式查看 frame 层级。

## [WebBrain/BrowserKing iframe 模式搬迁] - 2026-05-24

**目标**：进一步吸收 WebBrain 与 BrowserKing 中适合 BrowserHelm 当前阶段的 iframe 处理方式，提升动态 iframe 表单的可观测性。

**设计决策**：选择搬迁两项安全能力：其一，content script 改为 `document_start + all_frames`，更接近 BrowserKing 的早注入 a11y 脚本；其二，新增只读 `bh_frame_list` 工具，类似 WebBrain 的 `get_frames`，用于 Debug/Form mode 查看 frame id、URL 和父子关系。原因：这两项不修改页面状态，能直接帮助排查 Apple 账号页这类 iframe widget。

**偏差说明**：仍未搬迁 WebBrain 的 `iframe_click` / `iframe_type`。原因：这些是动作工具，会修改页面状态；BrowserHelm 当前 v0.31/v0.32 是只读识别与诊断，动作工具应进入 v0.33 Action Readiness 和 approval policy 后再设计。

**权衡分析**：
- 方案一：只保留已有聚合，不暴露 frame list。优点是协议少；缺点是调试 Apple/Stripe 这类嵌入式 widget 时缺少 frame 层级线索。
- 方案二：新增只读 frame list RPC 和工具。优点是可解释、低风险、便于模型/维护者判断目标内容是否在跨域 iframe；缺点是多一个工具契约需要维护。
- 选择方案二，因为它符合当前只读边界，也能继承 WebBrain 的 frame 可观测优势。

**验证记录**：
- `npx vitest run tests/node/entrypoints/content-config.test.ts tests/node/tools/page/page-tools.test.ts tests/node/page/messaging/content-rpc-client.test.ts`：7 tests passed。
- `npm run build`：passed；产物 manifest 已确认 `all_frames: true` 与 `run_at: document_start`。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run test:e2e -- tests/e2e/specs/extension/page-observation.spec.ts --grep "iframe|delayed iframe"`：2 tests passed，真实 Chrome for Testing / unpacked extension / iframe fixtures。

**待确认**：
- [ ] v0.33 是否新增动作类 iframe 工具，并要求显式 action readiness + approval。
- [ ] 是否给 side panel Debug/Form UI 增加 frame list 可视化，而不只暴露给 Agent 工具。

## [Gmail 原生 side panel 目标 Tab 绑定修复] - 2026-05-25

**目标**：修复真实 Chrome Gmail 页面中，原生 BrowserHelm side panel 执行 `bh_page_observe` 稳定报 `CONTENT_SCRIPT_UNAVAILABLE: Could not establish connection. Receiving end does not exist.` 的问题。

**设计决策**：选择在 background 侧为当前 active tab 调用 `chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html?target=active&tabId=<tabId>", enabled: true })`，让原生 side panel 显式携带当前目标 tabId。原因：Chrome 插件实测 Gmail DOM 可读，BrowserHelm 图标也有站点访问权限；失败更符合 native side panel 未携带稳定目标、运行时只能靠 `chrome.tabs.query({ active, currentWindow })` 推断目标导致的错绑。

**偏差说明**：未用 Chrome 插件直接打开 `chrome-extension://.../sidepanel.html?tabId=...` 做对照。原因：Chrome 插件安全策略阻止访问 extension URL；改用真实 Chrome open tabs、Gmail DOM 可读性和当前代码路径综合定位。

**权衡分析**：
- 方案一：继续让 side panel 自己查询 active tab。优点是代码少；缺点是在原生 side panel、扩展页和多窗口上下文中目标不稳定。
- 方案二：background 在 tab 激活/更新时把 tabId 写入 per-tab side panel path。优点是目标确定，和 E2E/debug tab 的验证路径一致；缺点是依赖 Chrome sidePanel per-tab options。
- 选择方案二，因为它最小化改变且直接消除 native side panel 的目标推断。

**验证记录**：
- `@chrome` 真实 Chrome：确认 Gmail tab `https://mail.google.com/mail/u/0/#inbox` 可被 Chrome 插件读取，标题为 `收件箱 (422) - counterxing@gmail.com - Gmail`。
- `npx vitest run tests/node/runtime/side-panel-target.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**待确认**：
- [ ] 重新加载系统 Chrome 中的 BrowserHelm 扩展后，在 Gmail 原生 side panel 复验是否不再报 `CONTENT_SCRIPT_UNAVAILABLE`。

## [原生 side panel Active Tab 切换跟随修复] - 2026-05-25

**目标**：修复原生 BrowserHelm side panel 从 active tab 1 切到 active tab 2 后，仍沿用旧初始化目标，除非手动刷新才恢复的问题。

**设计决策**：选择把 background 生成的原生 side panel path 标记为 `target=active&tabId=<tabId>`，side panel 看到 `target=active` 时在 `tabs.onActivated` / `tabs.onUpdated` / frame navigation 后更新 URL 中的 `tabId` 并重新观察当前 active tab。原因：debug tab 需要固定 `tabId`，而原生 side panel 应跟随用户当前 tab；二者必须显式区分。

**偏差说明**：没有让 debug tab 也跟随 active tab。原因：debug tab 是自动化/E2E 的稳定入口，固定目标是既有设计，不能被用户切 tab 影响。

**权衡分析**：
- 方案一：只在 background 更新 per-tab path。优点是改动少；缺点是已打开的 native panel 文档不一定重新加载，仍可能持有旧 `tabId`。
- 方案二：background 标记 active 语义，side panel 运行时主动跟随 tab 切换。优点是覆盖已打开 panel 的切换场景；缺点是 side panel URL 会随 active tab 更新。
- 选择方案二，因为它直接覆盖用户真实复现场景，同时保留 debug tab 的 pinned 语义。

**验证记录**：
- `npx vitest run tests/node/runtime/side-panel-target.test.ts tests/node/ui/sidepanel-render.test.tsx`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**补充修正**：`@chrome` 复测真实 Chrome open tabs 后，发现用户复现场景里原生 side panel 可能仍以裸 `sidepanel.html` 运行；此前 `readTargetModeFromUrl` 会把没有 `target=active` 的 URL 默认判为 pinned，导致 tab 切换事件不触发刷新。已改为：无 query 参数默认 active 跟随；只有 `?tabId=...` 的 debug URL 默认 pinned；`?target=active&tabId=...` 显式 active。

**补充验证**：
- `npx vitest run tests/node/ui/sidepanel-target-mode.test.tsx tests/node/runtime/side-panel-target.test.ts tests/node/ui/sidepanel-render.test.tsx`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**二次定位**：用户继续复现后，进一步判断原生 side panel 已存在文档在重新 active 目标页时并不会重新 mount/init，且 side panel 内部 `chrome.tabs.onActivated` 监听不可靠。改为 side panel 通过 runtime port 连接 background，由 background 在 `tabs.onActivated` / active tab completed 时主动推送 `BH_SIDE_PANEL_TARGET_TAB_CHANGED`，side panel 收到后更新目标 `tabId` 并触发 observe。

**二次验证**：
- `npx vitest run tests/node/ui/sidepanel-target-mode.test.tsx tests/node/runtime/side-panel-target.test.ts tests/node/ui/sidepanel-render.test.tsx`：passed，覆盖 target mode 与 background target message。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**最终定位**：用户说明“已经有的页面，点开扩展弹出来时不会初始化”后，确认真正根因是 Chrome 扩展 reload/install 后，manifest `content_scripts` 不会自动注入到已经存在的页面；只有页面刷新或重新导航才会获得 content script listener。因此 background 对旧 tab 调用 `chrome.tabs.sendMessage` 会稳定出现 `Receiving end does not exist`。

**最终修正**：`ChromeContentRpcClient` 在发送页面 RPC 前用 `chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content-scripts/content.js"] })` 对目标 tab 做一次按需补注入；content script 增加全局安装标记，避免重复执行时注册多个 `onMessage` listener。补注入按 tab 在当前 background 生命周期内去重。

**最终验证**：
- `npx vitest run tests/node/page/messaging/content-rpc-client.test.ts tests/node/entrypoints/content-config.test.ts tests/node/ui/sidepanel-target-mode.test.tsx tests/node/runtime/side-panel-target.test.ts`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。

**待确认**：
- [ ] 系统 Chrome 重新加载扩展后，不刷新已存在的 Gmail tab，直接点击 BrowserHelm 扩展图标打开原生 side panel，确认 observe 会自动补注入并成功。
