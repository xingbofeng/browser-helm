## 提交前自动校验钩子补齐 - 2026-05-28

**目标**：让“提交前必须跑 typecheck/eslint/test/e2e”变为本地可自动执行，减少人工遗漏。

**设计决策**：新增 `scripts/setup-pre-commit-hook.ts`，在 `npm run postinstall` 时写入 `.git/hooks/pre-commit`，钩子执行 `npm run preflight`。

**偏差说明**：`pre-commit` 由 npm 生命周期安装到仓库本地 `.git/hooks`，不会影响跨平台 CI，仅在有 git 工作树的开发环境生效。

**权衡分析**：
- 方案一：依赖开发者手动在每台机器运行 `npm run preflight`。优点是无额外脚本。缺点是高遗漏率。
- 方案二：加入本地钩子安装脚本。优点是提交前强约束。缺点是初次 `npm install` 会写入 `.git/hooks`。
- 选择方案二，因为任务明确要求提交前自动执行检查。

**验证结果**：
- 预置脚本已写入 `package.json`：`setup:hooks`、`postinstall`；钩子脚本文件已新增并可重入安装。

**待确认**：
- [ ] 是否接受每次 `npm install` 同步刷新 `pre-commit`（建议保留以保证一致性）。

## 发布与域名配置收口 - 2026-05-28

**目标**：完成发布后可直接下载的官网构建产物和自定义域名可访问性。

**设计决策**：在 CI 与 Vercel build 命令基础上，执行 `npm run build:landing` 并使用最新 production build 重新部署；对 `brower-helm.counterxing.top`，确认该子域已在 Vercel 项目 `browser-helm` 上显示为分配域名，并尝试创建 A 记录 `76.76.21.21`。

**偏差说明**：Vercel 侧域名配置已写入，当前卡在外部 DNS 解析未生效（解析返回 `28.0.0.60`，非 Vercel 的指向值），因此自定义域暂未可访问。该问题与本仓库代码无关，需在域名托管方补齐解析。

**验证结果**：
- `npm run preflight` 通过（`typecheck + lint + test + test:e2e`）。
- `npm run build:landing` 通过，生成 `dist/landing/browser-helm-latest.zip`。
- Vercel 已成功生产部署并更新到 `browser-helm-96xy280ti-counterxing-4213s-projects.vercel.app`，并保留 `browser-helm.vercel.app` 别名。
- `brower-helm.counterxing.top` 已在 Vercel 显示为 `browser-helm` 项目域名，建议记录值 `A 76.76.21.21`。

## 发布与官网打包交付 - 2026-05-28

**目标**：建立提交前脚本与 GitHub CI 校验，生成可下载的落地页打包产物，配置 Vercel 项目部署与 GitHub 仓库官方入口。

**设计决策**：将“提交前检查”统一为 `preflight`（`typecheck + lint + test + test:e2e`），并新增 `build:landing` 用于产出静态落地页目录（复制 `.output/chrome-mv3/options.html` 与 `browser-helm-latest.zip`）。Vercel 采用该产物作为输出目录。

**偏差说明**：Vercel 自动部署成功，当前环境未能完成 `brower-helm.counterxing.top` 自定义域名绑定（CLI 返回域名访问权限/记录管理不足）。可通过域名供应商添加 CNAME 并在有域名授权的同一账号继续 `vercel alias` 完成。

**权衡分析**：
- 方案一：新增独立官网站点静态前端。优点是与扩展代码解耦。缺点是新增构建链路和域名托管配置。
- 方案二：复用 `options` 落地页产物并构建成 Vercel 静态站。优点是改动小、资源复用高。缺点是网站与 options 页面文本共享。
- 选择方案二，因为当前目标是尽快可交付“下载按钮 -> ZIP 包”路径。

**验证结果**：
- `npm run preflight`
- `npm run test:e2e`
- `npm run build:landing`
- `npm run build`（Vercel 部署构建）

**待确认**：
- [ ] 请确认是否允许我在同一账号/团队继续完成 `brower-helm.counterxing.top` 的域名验证与绑定。

## Options 暗色落地页 - 2026-05-28

**目标**：仿照 wechatsync.com 的信息结构，为 BrowserHelm 生成一个简单暗色落地页，并保留右上角多语言选择。

**设计决策**：复用现有 `options` 入口承载落地页，因为该入口原本只是 settings 占位，不影响 Cockpit UI 主路径。页面移除顶部导航栏、定价和文档导向，仅保留右上角语言切换；首屏使用 BrowserHelm 品牌、产品 mockup 和 Ask/Act/Cockpit 语义突出项目能力。
后续按视觉反馈补回右上角 GitHub / 安装扩展操作，并将语言切换从原生 select 改为自绘深色菜单，避免出现系统默认下拉样式；首屏两个 CTA 同步改为“安装扩展”和“访问 GitHub”。

**偏差说明**：Codex Browser 工具本轮未暴露，视觉验证使用 Playwright fallback 和本地静态服务完成；没有验证真实 Chrome options 页面宿主，只验证了构建产物静态渲染。

**权衡分析**：
- 方案一：新增独立官网入口。优点是职责清晰；缺点是需要额外 WXT 入口和路由约定。
- 方案二：复用 `options` 入口。优点是改动小、可直接构建预览；缺点是后续若 options 要恢复设置页，需要再拆入口。
- 选择方案二，因为当前需求是简单落地页，且 `options` 入口还没有真实设置功能。

**验证结果**：
- `npm run build` 通过。
- `npm run typecheck` 未通过：当前工作树中 `tests/node/ui/sidepanel/cockpit-app.test.tsx` 存在 TS1109 语法错误，和本次 options 落地页改动无关。
- `npm run lint` 未通过：当前工作树中多个测试文件存在未使用 `I18nProvider` import，和本次 options 落地页改动无关。
- Playwright fallback 打开 `http://127.0.0.1:4173/options.html`，桌面与 390px 移动宽度结构快照可读；截图检查确认无顶部导航栏、右上角 GitHub / 安装扩展 / 语言选择存在、首屏暗色风格生效。

**待确认**：
- [ ] 后续是否需要把落地页从 `options` 拆成独立官网入口？

## v1.1 安全与运行时语义加固 - 2026-05-28

**目标**：按第二轮 review 收口 v1.1 表单提交、字段值脱敏、provider prompt/trace、content RPC 授权、stream cancel、manifest 权限和工具输入错误语义。

**设计决策**：verify failed 策略统一为“默认阻断自动提交，但用户可通过 high-risk approval 继续”；approval 后先重新 verify 当前 DOM，若原审批是通过态但当前失败则标记 stale，若原审批已明确 `verifyFailed` 则允许高风险继续提交。表单值在 ToolResult/trace/provider context 中只保留 presence/masked 信息，真实值只留在 UI reveal 的内存态。表单 mutation RPC 与 iframe action 一样使用一次性 token。

**偏差说明**：没有在本轮重构整个 `RunLifecycleService` 或把 RecoveryPolicy 完整接成自动恢复闭环；这两项属于较大架构迁移。本轮先修真实安全边界和可验证行为，并把 `StartRunInput.goal/successCriteria`、typed `RuntimeEvent`、provider abort、wait stable、iframe/viewport invalid id 等低风险结构问题补齐。

**权衡分析**：
- 方案一：把所有 review 架构建议一次性重构。优点是概念最统一；缺点是会大幅扩大回归面，尤其影响 extension runtime/E2E。
- 方案二：先落地安全语义、脱敏、授权、abort、manifest/audit 与测试覆盖，再保留大重构为后续任务。优点是风险可控且当前产品可信度明显提升；缺点是生命周期服务仍然偏重。
- 选择方案二，因为本轮目标是“不管 P 几都修真实问题”，但需要保护已通过的 v1.1 主链路。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：135 个文件通过 / 838 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个 E2E 全部通过。
- `npm audit --omit=dev --json` 通过：0 vulnerabilities。

**待确认**：
- [ ] 是否把 `RunLifecycleService` 拆成 `FormAssistService` / `LongPageReadService` / `DiagnosticOrchestrator` 作为下一轮纯架构重构？

## Ask/Act 模式收敛与内部表单策略 - 2026-05-27

**目标**：把用户主入口从四种模式收敛为 `询问 / Ask` 与 `执行 / Act`，同时保留 `form/debug` 作为内部协议能力；修复“帮我回复下...”这类执行意图不会自动填入表单的问题。

**设计决策**：主输入框只暴露 Ask/Act。Ask 永远只读，不做自动填表；Act 可以在内部调用表单策略，但只允许低敏、高置信、空字段的填写与验证，不自动点击发送、提交、发布等最终动作。`form/debug` 继续保留在 schema/runtime 中，避免破坏已有工具路由、trace 和高级调试面板。

**偏差说明**：本次没有把最终提交确认重做成新的内联问答卡审批流；现阶段先收敛主入口和自动填入边界，继续沿用既有高风险 approval 机制保护最终提交。

**权衡分析**：
- 方案一：彻底删除 `form/debug`。优点是概念最干净；缺点是会破坏现有 runtime、测试和高级调试工具面。
- 方案二：UI 收敛为 Ask/Act，内部保留 `form/debug`。优点是用户心智简单，兼容成本低；缺点是代码里仍需明确区分产品模式和内部策略。
- 选择方案二，因为这能最快解决主入口混乱和回复填表不触发的问题，同时不拆掉 v1.1 已验证的表单工具链。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：131 个文件通过 / 800 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个 E2E 通过。

**待确认**：
- [ ] 是否继续把最终提交/发送确认做成消息流里的内联确认卡，而不是沿用当前 approval drawer。

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

## v1.1.1 安全与 runtime 语义继续加固 - 2026-05-28

**目标**：收口第二轮 review 中剩余的 runtime 语义、架构命名、权限、provider、ToolSelector、metrics 和稳定等待问题。

**设计决策**：内部 run 入口采用 `runKind: observe_only | diagnose | answer | form_assist`；ToolSelector 移到 `src/tools/core/tool-selector.ts`，按 mode、capability、pending approval、domain policy、page state 和 risk 裁剪工具；内部诊断命名改为 `DeterministicDiagnosticModelClient` / `runDeterministicDiagnostics`；`RunLifecycleService` 拆出 `FormAssistService` 和 `LongPageReadService`；本地 provider endpoint 增加 UI 明示和 `allowLocalProviderEndpoints` 设置；provider trace/snapshot 记录 token 估算和未定价 cost 状态；content script 默认匹配收窄为 http/https；`PAGE_WAIT_UNTIL_STABLE` 在 DOM quiet 后额外等待 layout frames 和 fonts readiness。

**偏差说明**：没有引入真实 provider 价格表做 cost 计算，当前记录 `costUsdEstimate: null` 和 `costEstimateStatus: "unpriced"`。原因是不同 OpenAI-compatible endpoint 价格不可由 baseUrl/model 稳定推断，错误金额比显式未定价更危险。

**权衡分析**：
- 方案一：一次性重写 runtime agent core。优点是概念更纯；缺点是会冲击已通过的 extension/runtime/E2E 主链路。
- 方案二：在现有主链路上拆分服务、强化类型边界并补行为测试。优点是风险可控，能逐项关闭 review 问题；缺点是需要逐步替换旧调用点。
- 选择方案二，因为当前阶段目标是 hardening 和语义收口，而不是重写 agent kernel。

**待确认**：
- [ ] 后续是否接入 provider/model 价格配置，让 `costUsdEstimate` 从 unpriced 变成可选精确估算。

## 第二轮 review 剩余项收口 - 2026-05-28

**目标**：继续修复第二轮 review 中尚未完全落地的恢复闭环、Debug 能力边界、敏感域注入边界和表单 DOM 模块边界。

**设计决策**：Runtime 工具恢复不再只设置 snapshot，而是统一写入 `recovery_action` trace；`repair_tool_args` 只做确定性安全转换（如字符串数字/布尔值），无法确定时进入 `waiting_for_user`；`find_alternative_ref` 先重新观察页面，并且只有在 role/name 明确匹配时才替换 ref 重试。Debug UI 显示“浅层 Debug / CDP 不可用”，避免用户误认为当前已经具备 DevTools/CDP 深度能力。表单 DOM 层先拆出类型、可写性判断和合成表单检测，保留原 `form-fill-dom.ts` 作为兼容出口。TaskClassifier 对“表单 + 提交/发送/删除”等混合任务保留 `actionIntent` 和 `requiresApproval`，避免 mode 保守降级时丢失动作语义。

**偏差说明**：没有把 Debug 升级为 CDP deep inspector。该能力属于 roadmap 中 v1.3 范围；本轮先把浅层能力边界显式展示，并继续收口 runtime 语义。

**权衡分析**：
- 方案一：对恢复策略引入完整模型修参循环。优点：概念上更接近 tool-using agent；缺点：当前 runtime 主链不是完整 AgentLoop，贸然接入会扩大 provider/approval 风险。
- 方案二：实现一轮确定性恢复和明确的人类接管状态。优点：可测试、可审计、不伪造参数；缺点：复杂修参仍需用户或后续 AgentLoop 接管。
- 选择方案二，因为本轮目标是补齐可信恢复语义，而不是让 runtime 猜测缺失信息。

**验证结果**：
- `npm test -- tests/node/runtime/run/tools/tool-execution-service.test.ts` 通过。
- `npm test -- tests/node/ui/components/agent-components.test.tsx tests/node/tools/debug/debug-tools.test.ts tests/dom/page/dom/page-health-reader.test.ts` 通过。
- `npm test -- tests/dom/page/dom/form-fill-dom.test.ts` 通过。
- `npm run typecheck` 通过。

**待确认**：
- [ ] 是否把 Debug/CDP deep inspector 明确排入 v1.3 变更，而不是继续混在 v1.1 hardening 中。

## 第二轮 review 语义硬化续修 - 2026-05-28

**目标**：继续收口剩余的 domain policy、runtime event、run kind、debug hook 和 lifecycle 职责边界。

**设计决策**：新增 `BrowserHelmDomainPolicy` 存储契约，content script 和 dynamic injection 都通过同一套 `evaluateBrowserHelmDomainPolicy()` 判定；普通 http/https 默认启用，显式 enabled list 会切换为 allow-list 模式，blocked list 优先拒绝，banking/payment/medical 等 restricted 域名必须显式 `allowRestrictedDomains` 才能运行。移除旧的 provider-skip 布尔入口，统一使用 `runKind`。`runtimeEventSchema` 改为按 `type` 分支的 discriminated union，并要求 payload 为对象形元数据。Debug bridge 在页面主上下文注入 console/window error、console debug/info/log/warn、fetch/XHR hook，将浅层信号发回 content script。Goal revision 拆出 `GoalRevisionService`，让 lifecycle service 不再直接维护 revise-goal 状态更新。

Manifest 默认 host 权限也同步收口：`host_permissions` 为空，`http://*/*`、`https://*/*` 和 `<all_urls>` 只保留在 `optional_host_permissions` 中；运行时依靠 `activeTab`、用户授权的 optional host permission 与 domain policy 共同控制页面注入边界。

**偏差说明**：RuntimeEvent 的 TypeScript 事件对象仍允许自定义字符串事件，原因是现有内部 trace 工具和测试 helper 仍会构造非 schema 事件；真正跨 runtime port 的校验以 `runtimeEventSchema` 为准，未知事件会被拒绝。

**权衡分析**：
- 方案一：默认禁用所有域名，必须用户逐域开启。优点：最小权限；缺点：会破坏当前 content script 自动观察和本地 E2E 主路径。
- 方案二：普通域名默认启用，支持 allow-list/block-list/restricted override。优点：兼容当前产品体验，同时具备显式按域收口能力；缺点：不是最严格的发布默认值。
- 选择方案二，因为 BrowserHelm 当前还是开发态原型，既要保住稳定验证路径，也要把可配置安全边界落到代码。

**验证结果**：
- `npm test -- tests/node/entrypoints/content-config.test.ts tests/node/shared/domain-policy.test.ts tests/node/page/messaging/content-rpc-client.test.ts tests/node/ui/stores/settings-store.test.ts` 通过。
- `npm test -- tests/node/runtime/runtime-messages.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts tests/node/runtime/run/runtime-event-utils.test.ts tests/node/runtime/run/run-store.test.ts tests/node/runtime/run/streaming-state.test.ts` 通过。
- `npm test -- tests/node/runtime/run/goal-revision-service.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts` 通过。
- `npm run typecheck` 通过。
- 全量收口验证：`npm run typecheck`、`npm run lint`、`npm run build`、`npm test`、`npm run test:e2e`、`npm audit --omit=dev --json` 均通过；Vitest 为 137 个文件通过 / 865 个测试通过 / 1 个文件跳过 / 1 个测试跳过，E2E 为 41 个场景通过，依赖审计 0 漏洞。
- 漏项扫描：`skipProviderResponse` 已无残留；manifest 产物中 `host_permissions` 为空；伪造默认邮箱/手机号仅保留在负向断言测试中；Markdown 渲染仍使用 `dangerouslySetInnerHTML`，但入口已先经过本地 allowlist sanitizer。

**待确认**：
- [ ] 正式发布构建是否要把 `defaultEnabled` 默认改为 false，并要求用户逐域启用。

## 移除旧标记与兼容别名 - 2026-05-28

**目标**：按反馈移除代码和文档里的旧接口标记；旧接口既然不用，就直接删除，不再以兼容形式保留。

**设计决策**：删除 `RuntimeDiagnosticModelClient` 和 `enrichSnapshotWithDiagnostics` 两个旧兼容导出，只保留当前名称 `DeterministicDiagnosticModelClient` 与 `runDeterministicDiagnostics`。文档里的旧工具表述统一改为“已删除/不保留兼容工具”。测试中的旧选项样例改成普通 warning 文案。

**偏差说明**：没有删除历史 archive 文档本身，只移除了其中的旧接口标记表述；这些 archive 仍保留 v1.0.2 的决策记录。

**验证结果**：
- 旧接口标记关键词全仓库扫描无匹配。
- `npm test -- tests/dom/page/dom/page-health-reader.test.ts tests/node/runtime/runtime-diagnostic-model-client.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts` 通过：3 个文件 / 14 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 无。

## 统一主 Runtime AgentLoop - 2026-05-28

**目标**：删除旧的 provider answer、deterministic diagnostic、FormAssist/LongPage 独立编排路径，把 Ask/Act/Form/Debug 主运行统一到一个 JSON AgentDecision tool-calling loop，并修复真实 Google 首页无法自动填写的问题。

**设计决策**：新增 `UnifiedRuntimeAgentLoop` 作为主 runtime 决策器：每轮 provider 只能返回 `tool_call` / `finish` / `ask_user` / `fail`，工具执行统一走 `ToolExecutionService`、policy、approval 和 trace。Act 模式允许使用 Form 工具，但 `bh_form_fill_many` 有 runtime guard：字段必须来自当前观察结果，目标字段必须可写、非敏感、非隐藏/文件、未填充，value 必须是用户任务中的显式子串。content script 保持单例 `ContentRpcHandler`，确保 ref map 和一次性 action token 不跨消息丢失。表单 submit approval 后重新 verify/readiness，并为真实 submit 获取新的 runtime action token。

**偏差说明**：不保留兼容旧 runtime 服务，旧 `ProviderResponseService`、`FormAssistService`、`LongPageReadService`、`RuntimeDiagnosticModelClient` 已删除。E2E mock provider 改为返回统一 AgentDecision JSON，而不是旧的自由文本流。真实 provider 里出现的 `{ tool_call: {...} }` wrapper 和可安全转换的 `bh_form_fill`/`formFields` 旧形状在 parser 层规范化，避免真实模型轻微格式偏差直接中断。

**权衡分析**：
- 方案一：保留旧 deterministic 链路并在外层桥接 unified loop。优点是短期兼容；缺点是继续存在两套 agent 语义。
- 方案二：直接删除旧链路，只保留统一 loop。优点是 runtime/trace/tool/approval 语义一致；缺点是需要同步更新 E2E 和 provider mock。
- 选择方案二，因为当前阶段没有兼容包袱，统一语义比保留旧路径更重要。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：137 个文件通过 / 879 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。
- 真实验证：Chrome for Testing headless 加载 `.output/chrome-mv3`，读取 `.env.development` 中真实 DeepSeek provider 配置，打开 `https://www.google.com/ncr`，运行 `帮我搜索 “美国”`；Google 搜索框最终值为 `美国`，最后成功工具为 `bh_form_fill_many` / `OK`。

**待确认**：
- [ ] 是否要把真实 Google 验证脚本沉淀成可复用 npm script。

## Floating Panel document_start 时序修复 - 2026-05-28

**目标**：修复全量 E2E 中 floating icon 偶发不出现、icon 图片加载断言失败的问题。

**设计决策**：content script 在 `document_start` 执行时，如果 `document.documentElement` 尚未就绪，不再静默放弃安装 floating panel，而是通过 `setTimeout(0)` 和 `DOMContentLoaded` 排队重试；iframe 内仍按 `window.top !== window` 直接跳过，不创建 floating host。

**偏差说明**：没有修改 E2E 断言或放宽超时；修复点放在内容脚本安装时序上。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e -- tests/e2e/specs/extension/floating-panel.spec.ts` 通过：9 个场景。
- `npm run test:e2e` 通过：41 个场景。

**待确认**：
- [ ] 无。

## 页面观察排序、中文自由文本填充与无头 E2E - 2026-05-28

**目标**：修复“已完成页面观察”卡片在同一轮回答中落到最下面的问题；修复 GitHub Dashboard 这类“输入一个『…』”任务只推断不填充的问题；确保 E2E 固定无头执行。

**设计决策**：消息展示层会把同一个 run 的 `page_summary` 固定放到该 run 的用户任务后面、provider 回答和工具状态前面；历史自动观察卡如果没有同 run 用户任务，则保留原顺序，不会被移动到新用户消息后。表单推断增加中文 `输入/填入/填写/键入/打上` 自由文本抽取，并在多个文本框中只选择一个最匹配字段：优先 textarea / ask / message / reply 语义，非搜索任务不再误填搜索框。E2E extension helper 移除 `BROWSER_HELM_E2E_HEADLESS=0` 覆盖，固定 `headless: true`。

**偏差说明**：没有对用户提供的 GitHub 真实页面重新执行外部写入验证；本次根据下载 trace 复现字段结构，并用 RunManager 单测覆盖 `Find a repository…` + `Ask anything or type @ to add context` 的自动填充路径。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：137 个文件 / 868 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。

**待确认**：
- [ ] 无。

## 原生 Side Panel 与页面浮层互斥 - 2026-05-28

**目标**：修复先打开浏览器原生 side panel，再点击页面右侧 BrowserHelm 浮动入口时会同时出现两个驾驶舱 UI 的问题。

**设计决策**：background 维护 side panel port 的 surface 和目标 tab 映射。原生 side panel 连接时不再依赖 `port.sender.tab.id`，而是优先从 side panel URL 的 `tabId` 解析目标页面，解析不到再回退 active tab，并向该 tab 发送 `FLOATING_PANEL_CLOSE`。页面浮动入口点击时不直接在 content script 中调用 `chrome.sidePanel.open`，而是发送 `FLOATING_PANEL_OPEN_NATIVE` 给 background；如果对应 tab 的原生 side panel 已打开，background 直接返回 opened，content script 保持页面浮层关闭。

**偏差说明**：Chrome 可能不接受从 content script 消息链间接触发的 `chrome.sidePanel.open()`，因此页面浮动入口在原生未打开时仍保留 iframe fallback；本次重点保证原生已打开时不会再展开第二个页面内嵌面板。

**权衡分析**：
- 方案一：彻底删除页面内嵌 fallback。优点是不会双开；缺点是当原生 side panel API 不能被程序化打开时，页面入口会失效。
- 方案二：保留 fallback，但用 background 记录原生 side panel 状态并强制互斥。优点是保留旧入口可用性，同时修复双开；缺点是状态同步需要依赖 side panel port 生命周期。
- 选择方案二，因为它修复当前真实 bug，同时不砍掉页面浮动入口的降级能力。

**验证结果**：
- `npm run build` 通过（由 `npm run debug:extension` 执行）。
- SOP 使用 Chrome for Testing / unpacked extension / `BROWSER_HELM_DEBUG_CDP_PORT=9345` 验证：原生 side panel 可见时，再点击页面右侧 floating icon 后，`#browserhelm-floating-entry-host[data-open]` 仍为空，页面内嵌 panel transform 仍为隐藏状态，没有展开第二个面板。
- `npx vitest run tests/node/runtime/side-panel-target.test.ts tests/node/runtime/background-message-guards.test.ts` 通过。
- `npx eslint src/entrypoints/background.ts src/entrypoints/content.ts src/background/runtime/side-panel-target.ts src/background/runtime/background-message-guards.ts src/shared/constants/event-names.ts tests/node/runtime/side-panel-target.test.ts tests/node/runtime/background-message-guards.test.ts src/agent/report/findings-report.ts` 通过。

**待确认**：
- [ ] 后续是否要把页面浮动入口彻底改成只打开原生 side panel，去掉 iframe fallback。

## Ask 执行动作意图拦截 - 2026-05-28

**目标**：修复用户在 Ask 模式下提出输入、回复、填写、搜索等会改变页面的任务时，BrowserHelm 继续执行或生成“已输入”回复的问题。

**设计决策**：在 runtime startRun 早期检查显式 Ask + actionIntent；命中时将 run 停在 `waiting_for_user`，返回“需要切换到执行 / Act”的 recommendation 消息，不观察页面、不调 provider、不触发任何填表工具。任务分类器补充“填写、填入、回复、评论、留言、搜索、选择”等中文输入信号。

**偏差说明**：本次先用消息提示用户切换模式并重新发送，没有新增一个真正的通用“批准切换 mode”交互按钮；这样改动面最小，也符合当前 ChatPanel 已有 Ask/Act 模式选择。

**权衡分析**：
- 方案一：让 Ask 自动升级成 Act。优点是少一步操作；缺点是用户显式选择 Ask 时仍扩大了页面 mutation 权限。
- 方案二：Ask 下检测到动作意图就停下并请求用户切换。优点是权限边界清晰，不会误写页面；缺点是用户需要重新发送一次。
- 选择方案二，因为 Ask/Act 的产品边界就是“读”和“改”的显式授权。

**验证结果**：
- `npx vitest run tests/node/runtime/run-manager.test.ts -t "asks the user to switch to act"` 通过。
- `npx vitest run tests/node/agent/task/task-classifier.test.ts tests/node/agent/modes/mode-system.test.ts` 通过。
- `npm run typecheck` 通过。
- `npm run lint -- src/agent/task/task-classifier.ts src/background/runtime/run/run-lifecycle-service.ts src/i18n/locales/zh.ts src/i18n/locales/en.ts tests/node/runtime/run-manager.test.ts` 通过。

**待确认**：
- [ ] 后续是否要把“切换到 Act 并重发”做成消息里的单击确认按钮。

## 模型辅助表单字段选择 - 2026-05-28

**目标**：降低 `bh_form_infer_fill_plan` 纯本地规则在复杂页面上的误判风险，按 `docs/research.md` 中 WebBrain 风格的“observe first、模型选择工具/目标、mutation 后 verify”思路收口自动填充。

**设计决策**：保留现有工具名和 ToolResult 契约，把 `bh_form_infer_fill_plan` 定位为安全候选生成器；`FormAssistService` 在自动填充前读取 provider 配置，若用户任务中存在显式值，则向 provider 发送脱敏字段候选（ref、label、type、presence、placeholder、ariaLabel）和允许使用的显式值集合，让模型只返回 `{ fieldRefId, value, confidence, reason }`。运行时只接受可写、非敏感、非隐藏/文件、未填充字段，且 value 必须来自用户明确提供的值；provider 缺失、失败、低置信或非法输出时自动回退本地计划。

**偏差说明**：本次没有引入新的表单 planner 工具名，也没有让模型直接执行 DOM mutation；模型只负责选择字段和值，真实填写仍走 `bh_form_fill_many` 和后续 `bh_form_verify`。工具注册仍保留 `import.meta.glob('./**/bh-*.ts')` 动态扫描；为避免 helper 被动态扫描误注册，推断 helper 移到非 `bh-*.ts` 文件中，`bh-form-infer-fill-plan.ts` 只导出工具工厂。

**权衡分析**：
- 方案一：完全重写推断器为模型工具调用 AgentLoop。优点：最贴近 WebBrain；缺点：改动面大，会牵动 runtime 主循环和测试。
- 方案二：保留本地候选，新增 provider planner 只做目标选择。优点：改动小、可回退、不会放大自动写入权限；缺点：仍保留部分本地启发式作为 fallback。
- 选择方案二，因为它能先修复“不靠谱的字段选择”核心问题，同时不破坏现有表单主链。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/tools/form/form-fill-tools.test.ts` 通过：2 个文件 / 48 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm test` 通过：137 个文件通过 / 869 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。

**待确认**：
- [ ] 后续是否把 provider planner 扩展成正式 `ToolSelector/FormPlanner` 模块，并接入更多页面上下文位置特征。

## 工具描述本地化 - 2026-05-28

**目标**：修复中文界面下 Trace 工具卡仍显示英文工具描述的问题。

**设计决策**：工具说明文案统一进入 `src/i18n/locales/{zh,en}.ts`，新增 `tool.description.*` 翻译 key；`src/i18n/tool-descriptions.ts` 只维护 `ToolName -> TranslationKey` 映射并通过 `t(key, locale)` 取文案。`TraceLog` 使用 `useLocale()` 传入 locale，中文界面显示中文，英文界面保留英文。

**偏差说明**：本次只处理工具说明 UI 文案，不改工具 `ToolSpec.description` 的英文契约；工具契约仍面向 provider/内部注册，UI 展示统一走 i18n 字典。旧的 `src/shared/tool-descriptions.ts` 已删除，避免 UI 文案散落在 shared 层。

**验证结果**：
- `npm test -- tests/node/i18n/tool-descriptions.test.ts tests/node/ui/components/timeline-inspector.test.tsx` 通过：2 个文件 / 7 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 无。

## Act 表单规划去关键词化 - 2026-05-28

**目标**：修复 `帮我搜索“美国”` 这类 Act 任务只得到模型文字建议、没有真实填入的问题，同时避免继续堆中文关键词/正则作为自动执行策略。

**设计决策**：参考 `docs/research.md` 中 WebBrain 的 Ask/Act、observe-first、tool planner 和 verify-first 思路，Act/Form 在页面有表单字段时进入表单候选规划；本地 `bh_form_infer_fill_plan` 只产出安全候选或标记需要 planner，不直接用“搜索”等关键词生成值。provider planner 负责从用户任务和字段语义中选择字段和值；runtime guard 只接受可写、非敏感、未填字段，且写入值必须是用户任务中真实出现过的子串，防止模型编造默认值。填写后仍走 `bh_form_fill_many` 和 `bh_form_verify`。

**偏差说明**：还没有把 provider answer runtime 改成完整 WebBrain 式 function-calling AgentLoop；本次先把 Act 自动填充路径从“关键词触发”改成“候选 + planner + runtime guard”，减少正则扩张。

**验证结果**：
- `npm test -- tests/node/tools/form/form-fill-tools.test.ts tests/node/runtime/run-manager.test.ts` 通过：2 个文件 / 50 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：138 个文件通过 / 874 个测试通过 / 1 个文件跳过 / 1 个测试跳过。

**待确认**：
- [ ] 后续是否把 Act 主链升级为真正的 tool-calling loop，让 provider 直接按 schema 调用 `bh_form_fill_many` / `bh_form_verify`，而不是通过当前 FormAssistService 编排。

## Debug SOP 真实 Provider 配置种子 - 2026-05-28

**目标**：修复按浏览器扩展调试 SOP 启动干净 Chrome for Testing profile 时无法读取用户已配置 provider，导致 Google 首页真实验证只能停在 provider 未配置的问题。

**设计决策**：`scripts/debug-extension.ts` 启动调试会话时读取 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`，并以 `.env.development` 作为默认 dotenv fallback；解析成功后通过扩展 service worker 写入 `chrome.storage.local.providerSettings`。这保持 runtime 产品路径不变：RunManager 仍只读 `ChromeSettingsStore` 中的用户配置；调试脚本只负责把本地开发配置种子到新的调试 profile。可用 `BROWSER_HELM_PROVIDER_ENV` 指定其他 env 文件，或 `BROWSER_HELM_DEBUG_SEED_PROVIDER=0` 禁用种子。

**偏差说明**：浏览器扩展运行时不能直接读取本地文件系统中的 `.env.development`；因此读取 dotenv 放在 Node 调试脚本中完成，再落到扩展真实 storage。没有引入 mock provider，也不会打印 API key。

**验证结果**：
- `npm test -- tests/node/agent/model/provider-config.test.ts tests/node/runtime/run-manager.test.ts tests/node/tools/form/form-fill-tools.test.ts` 通过：3 个文件 / 55 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。
- 按扩展调试 SOP 使用 Chrome for Testing 打开真实 `https://www.google.com/`，调试脚本从 `.env.development` 种子真实 DeepSeek provider 配置；运行 `帮我搜索 ‘美国’` 后 trace 显示 `bh_form_infer_fill_plan` 使用 provider planner、`bh_form_fill_many` 成功填写 1/1 个字段，Google 搜索框最终值为 `美国`。

**待确认**：
- [ ] 无。
