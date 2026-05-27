## v1.1 Assisted Form Fill & Debug 实现 - 2026-05-27

**目标**：实现 v1.1 表单执行主路径（observe → read fields → infer fill plan → fill many → verify → submit approval → submit → observe result）。

**已完成的硬核心交付物**：

### Phase 1: Schemas & Contracts ✅
- `src/shared/schemas/form-fill.schema.ts` — 16 个新 schema（FillPlan, FillTarget, FillFieldResult, FillManyResult, FormVerifyResult, SubmitApprovalPayload, SubmitResult 等）
- `src/shared/constants/error-codes.ts` — 13 个新错误码（3503-3515）
- `src/shared/constants/tool-names.ts` — 5 个新工具名
- `src/shared/constants/event-names.ts` — 4 个 RPC 消息名 + 6 个 trace event 名
- `tests/node/shared/schemas/form-fill.test.ts` — 14 个 schema 测试

### Phase 2: Page DOM Form Capabilities ✅
- `src/page/dom/form-fill-dom.ts` (812 行) — 字段可写元数据、合成表单检测、setFieldText/setSelectOption/setCheckboxState 等 helper、fillSingleField/fillManyFields、verifyForm、executeSubmit（优先 button click，fallback Enter，不直接调 form.submit()）、observeSubmitResult
- `src/page/dom/form-reader.ts` — FIELD_SELECTOR 扩展至 contenteditable，snapshot 加 writable 元数据
- `src/shared/schemas/structured-page-data.schema.ts` — fieldWritabilityMetaSchema
- `tests/dom/page/dom/form-fill-dom.test.ts` — 42 个 DOM 测试全覆盖

### Phase 3: Form Tools ✅
- `src/tools/form/bh-form-infer-fill-plan.ts` — 纯推断工具，label/type/placeholder 模糊匹配
- `src/tools/form/bh-form-fill-field.ts` — 单字段填写，RPC 调用 content script
- `src/tools/form/bh-form-fill-many.ts` — 批量填写，partial success
- `src/tools/form/bh-form-verify.ts` — 验证工具，HTML5 validity + visible errors
- `src/tools/form/bh-form-submit-with-approval.ts` — 高风控提交审批，返回 APPROVAL_REQUIRED
- `src/page/messaging/content-rpc-schema.ts` — 4 个新 RPC message types
- `src/page/messaging/content-rpc-handler.ts` — 4 个新 handler cases

### Phase 4: Runtime/Agent/Policy/Trace ✅
- `src/shared/schemas/trace.schema.ts` — 6 个新 trace event schemas（fill_plan_created, field_fill_started, field_fill_result, form_verify_result, submit_approval_requested, form_submit_result）
- `src/agent/recovery/recovery-policy.ts` — 扩展至 v1.1 错误码（FORM_VERIFY_FAILED, SUBMIT_RESULT_UNKNOWN, FILL_RETRY_EXHAUSTED）
- `src/agent/prompts/system-prompt.ts` — Form mode 下指导 v1.1 表单流程

### 验证结果
- `npm run typecheck` — 0 错
- `npm test` — 107 文件通过 / 507 测试通过 / 2 跳过

### 设计决策
- **字段赋值走 RPC**：工具调用 content-rpc → content-script 内 form-fill-dom 执行，保证在目标页面上下文中操作 DOM
- **不逐字段确认，提交必确认**：fill 阶段 medium risk，submit 阶段 high risk + APPROVAL_REQUIRED
- **Submit 走用户路径**：优先 button click，fallback Enter keydown，绝不直接调 form.submit()
- **Submit result 三态**：success / failure / unknown，unknown 不假装成功

### 偏差说明
无重大偏差。Phase 5-7（Debug 抽屉 UI、E2E fixtures、截图验收）需要 Chrome for Testing 环境，不在纯单元测试范围内。

### 待确认
- [ ] E2E fixture 参考 `tests/e2e/fixtures/basic-form.html` 是否要新增 v1.1 专用 fixture
- [ ] 侧面板 submit approval card 的 UI 设计 (`docs/design/v1.1-assisted-form-fill-and-debug/01-assisted-form-fill-debug-ui.png`)
- [ ] README 工具表更新

## v1.1 Review 修复 - 2026-05-27

**目标**：全量 review 已完成的 v1.1 表单填写与 Debug 功能，修复实现、UI、trace 和测试缺口。

**设计决策**：保留“普通字段直接填写、真实提交必须审批”的产品边界；提交审批 UI 使用表单专用摘要卡，默认遮罩字段值，并通过眼睛按钮显示/隐藏非敏感字段预览。

**偏差说明**：原实现已有 v1.1 主体，但 runtime 审批通过后没有执行真实 submit、Debug 表单 tab 缺少生命周期事件、提交审批抽屉仍是通用 JSON 视图；本次补齐为真实 submit + post-submit observe、专用审批卡和 form lifecycle trace。

**权衡分析**：
- 方案一：审批请求内部保留 reveal 所需字段预览，trace 只写脱敏副本。优点：UI 可用且 Debug 不泄露工具参数；缺点：runtime pending state 仍需谨慎处理。
- 方案二：审批请求全量脱敏。优点：内部状态更保守；缺点：眼睛 reveal 无法显示用户需要确认的非敏感值。
- 选择方案一，因为：v1.1 明确要求提交前可检查字段值，同时 Debug/trace/下载链路应默认脱敏。

**待确认**：
- [ ] 是否需要把用户任务文本里的显式字段值也从 `run_started` trace 中脱敏？

## v1.1 Review 收口补强 - 2026-05-27

**目标**：按 v1.1 tasks 逐项复核实现与测试证据，补齐字段修改流程、真实提交 E2E、verify 失败仍提交审批和测试类型契约。

**设计决策**：Submit Approval Card 的字段修改不重启整轮任务，而是通过 side panel 调用 runtime `executeTool` 依次执行 `bh_form_fill_field`、`bh_form_verify`、`bh_form_submit_with_approval`，生成新的审批请求供用户确认。

**偏差说明**：审计发现 6.3 缺少真实 UI 入口，7.2-7.4 缺少覆盖完整 fill → verify → approval → submit → Debug trace 的 E2E；本次补齐 UI、runtime port、fixture、flow/spec，并修复 content verify 未解析 `submitRefId` 导致 submitAvailable 误判的问题。

**权衡分析**：
- 方案一：把字段修改做在现有 approval drawer 内。优点：用户仍处在提交确认上下文，不需要额外 dialog；缺点：drawer 组件需要处理 draft/apply/error 状态。
- 方案二：新增独立编辑 dialog。优点：交互空间更大；缺点：本轮明确先不做 dialog，且会扩大 UI 面。
- 选择方案一，因为：符合“先不做 dialog”和“debugpanel 保持默认不展开”的范围约束。

**验证结果**：
- `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e` 全部通过。
- `npx openspec validate --all --strict` 与 `npx openspec validate implement-v1-1-assisted-form-fill-debug --strict` 通过。
- E2E 覆盖成功提交、verify 失败仍提交审批、Debug drawer Form/Debug trace、审批值遮罩/显示和 redaction。

**待确认**：
- [ ] 是否需要把用户任务文本里的显式字段值也从 `run_started` trace 中脱敏？

## 恢复 v1.0.2 iframe/page read 工具面 - 2026-05-27

**目标**：修复当前构建中 `bh_page_read_visible_text`、`bh_page_read_article`、`bh_iframe_list`、iframe 文档读取和 viewport scroll 工具缺失/不可路由的问题，确保 v1.0.2 长页面与 iframe 读取能力在真实 Chrome extension runtime 中可用。

**设计决策**：选择在现有 content RPC 和工具自动注册体系上补齐 page read / iframe list / viewport tools，而不是重写 AgentLoop。Agent 语义统一使用 iframe/iframeId；底层 runtime 仍使用 Chrome frameId 作为技术路由标识。

**偏差说明**：旧 `bh_iframe_read` 测试仍按 v0.33 的 iframe ref target 语义断言 Ask 不可见；本次按 v1.0.2 决策更新为 Ask 可见，同时保留 ref target 兼容路径。

**权衡分析**：
- 方案一：只修 UI/快捷键，不补工具面。优点是改动小；缺点是 1.0.2 长页/iframe 真实能力仍缺失。
- 方案二：补齐工具与 content RPC 路由。优点是符合 v1.0.2/1.1 决策并能真实验证；缺点是触及 runtime tool surface。
- 选择方案二，因为真实 SOP 验证已证明缺口在工具注册和 frame routing，而不是单纯 UI。

**待确认**：
- [ ] 后续是否要按 roadmap 严格删除旧 `bh_frame_list` / `bh_iframe_click` / `bh_iframe_type`，还是继续保留作为 v0.33 兼容工具。

## 侧边栏回归复核与问答卡片防回归 - 2026-05-27

**目标**：按昨晚 bug 清单复核右侧浮动入口、快捷键、页面观察问答卡、发消息、表单修改、trace/debug 和完成态目标展示是否复现，并修复当前确认的回归点。

**设计决策**：页面观察卡作为当前页面状态的产品级卡片，只要 run snapshot 有 observation/structuredPageData 且消息流缺少 `page_summary`，UI 就兜底派生一张问答卡；不再把页面卡片绑定到“runtime messages 为空”这个偶然条件。运行中状态使用独立 progress card 展示具体动作、loading 和读秒，避免泛化为“AgentLoop 正在读取”。

**偏差说明**：真实 SOP 验证显示浮动 icon、图片、点击展开、快捷键、发消息和表单修改在 Chrome for Testing 中可用；本次主要修复的是页面卡片缺失防回归、运行中体验、完成后仍显示“当前 run 可修改目标”、工具状态文案和 E2E POM 对新 UI 的断言方式。

**权衡分析**：
- 方案一：只修当前截图里的卡片显示。优点是改动小；缺点是 runtime 消息一旦缺少 `page_summary` 仍会复现。
- 方案二：在 UI 层以 snapshot 为权威兜底生成页面卡片，并补测试。优点是对后续 runtime 消息变化更稳；缺点是组件需要更清楚地区分可见摘要与 raw data。
- 选择方案二，因为页面观察卡是产品稳定入口，应由当前 snapshot 保证，而不是依赖某个消息生成路径。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：121 个文件通过 / 675 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：17 个 E2E 全部通过。
- Chrome for Testing 真实验证：浮动 icon 图片加载、点击展开、`Alt/Opt+Shift+B` 收起、自动页面观察卡、发送 Ask 任务、Form 模式填写 email 和 checkbox 均通过。

**待确认**：
- [ ] 系统 Chrome 已安装的扩展是否加载了最新 `.output/chrome-mv3` 构建；如果用户当前浏览器仍复现，优先确认是否是旧构建未 reload。

## 长页面续读与元素定位回归修复 - 2026-05-27

**目标**：修复长文章页面只做一次 `bh_page_observe` 导致正文截断、无法总结的问题；修复可折叠高级调试抽屉中“元素与表单”点击不触发页面定位/高亮的问题。

**设计决策**：在 `ask` 模式中，如果初始 observation 带有 `VISIBLE_TEXT_TRUNCATED`，runtime 会在 provider 回复前自动调用 `bh_page_read_article`，最多读取 3 段正文并把合并正文作为 provider prompt 的补充上下文。元素定位修复为透传 `AdvancedDebugDrawer` 的 `onInspectElement`，不改变 `AdvancedDebugPanel` 的已有 API。

**偏差说明**：没有把 ask 模式改成完整 AgentLoop。原因是 v1.0.2 当前 runtime 架构仍是“observe + provider response”，本次先修最影响长页面总结的确定性断点，避免扩大模型决策循环范围。

**权衡分析**：
- 方案一：让所有 ask 任务进入完整 AgentLoop。优点是能力统一；缺点是风险大，会影响 provider streaming、工具审批和上下文压缩。
- 方案二：只在截断页面做 deterministic article read。优点是改动小、可测试、对长文页立即有效；缺点是最多读取 3 段，仍不是无限全文抓取。
- 选择方案二，因为本次目标是修复 Anthropic 长页面这类实际失败路径，并保持 v1.0.1/v1.0.2 已有 runtime 边界稳定。

**待确认**：
- [ ] 是否需要把 3 段 / 36k 字符上限暴露为设置？
- [ ] 是否需要在系统 Chrome 开发态增加自动 reload 提示，避免旧 side panel bundle 造成“昨天修过今天又没了”的误判？

## 侧边栏回归加固与 E2E 补全 - 2026-05-27

**目标**：把昨晚已修复但今天复现的侧边栏问题做成防回归保护，重点覆盖页面观察卡、长页面正文续读、streaming 合并显示、元素与表单定位高亮，以及旧“已完成页面读取/观察”状态卡复活的问题。

**设计决策**：完成态页面观察不再保留临时 observe status 卡，而是移除临时状态并以 `page_summary` / 问答卡片作为唯一用户可见完成结果。长页面 E2E 使用本地 OpenAI-compatible streaming mock，真实加载 Chrome extension 并验证 `bh_page_read_article`、streaming trace、最终回复卡片同时存在。元素与表单列表项增加明确 aria label，E2E 精确点击目标元素行，避免误点包含“阻止提交”的敏感字段行。

**偏差说明**：本次没有改动原生 Chrome 右侧 side panel 宿主的最终人工验收路径；自动化验证仍按项目 SOP 使用 Chrome for Testing 的 side panel debug tab。原因是这条路径能稳定加载 unpacked extension、断言 runtime/content RPC 和页面 DOM 高亮。

**权衡分析**：
- 方案一：只补 UI 快照或组件单测。优点是快；缺点是无法覆盖真实 extension runtime、content script、provider streaming 和页面 DOM 高亮。
- 方案二：补单测、DOM 测试和真实 E2E。优点是覆盖昨天回归的完整链路；缺点是 E2E 数量增加，运行时间略增。
- 选择方案二，因为这些问题都是跨 runtime/UI/content 的集成回归，只靠组件测试很容易漏掉。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：122 个文件通过 / 679 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：19 个 E2E 全部通过。

**待确认**：
- [ ] 是否要把 `127.0.0.1` loopback provider 仅限测试构建，还是保留为本地模型/代理开发的正式支持能力？
