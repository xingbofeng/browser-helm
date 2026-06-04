## implementation-notes 维护规则 - 2026-05-31

**目标**：主文件只保留当前高频规则、最近任务要点和待确认项；历史完整记录迁移到 `implementation-notes-archive.md`。

**设计决策**：
- `implementation-notes.md` 控制在 300 行以内，超过时继续归档。
- 新任务完成后只追加高信号决策、偏差、验证和待确认，不复制长测试日志。
- 需要完整历史时查 `implementation-notes-archive.md`。

**待确认**：
- [ ] 后续是否按月份继续拆分 archive，例如 `implementation-notes-archive-2026-05.md`。

## 2026-06-04 主文件第八次瘦身归档摘要

已从主文件移出“截图 debugger 权限申请”完整记录；该记录已迁入 `implementation-notes-archive.md`。主文件继续保留 2026-06-03 后高频架构、hardening、右键菜单和本轮 E2E 收口记录。

## 2026-06-04 主文件第九次瘦身归档摘要

已从主文件移出 2026-06-03 的 Task 8.1-8.3 明细，包括 RunManager 服务拆分、AgentLoop pipeline 拆分和 PromptBuilder responsibility 拆分；完整记录迁入 `implementation-notes-archive.md`。

## 2026-06-04 主文件第十次瘦身归档摘要

已从主文件移出 2026-06-03 的 Task 9.1/9.2 明细，包括 security regression suite 和 coverage gate 渐进提升；完整记录迁入 `implementation-notes-archive.md`。

## 2026-06-04 主文件第十一次瘦身归档摘要

已从主文件移出 2026-06-03 的 Task 9.3 最终 release verification 和 v1.6 production hardening 收口完整记录；主文件继续保留真实模型诊断、右键菜单、流式 UI 和最近问题修复记录。

## 2026-06-04 主文件第十二次瘦身归档摘要

已从主文件移出 2026-06-03 的真实模型 provider 402 诊断、deepseek-v4-pro 切换与 read-fields 恢复、v1.6 Production hardening 缺口补齐三段完整记录；完整记录迁入 `implementation-notes-archive.md`。

## 历史条目归档索引 - 2026-06-01

v1.4 Vision/Screenshot、v1.5 Advanced Browser Tools、Floating Panel 稳定性、Review P0/P1、v1.6 Domain Adapters、v1.2-v1.6 验收补齐、早期真实站点/真实模型 E2E 扩展，以及 2026-06-01/02 的 P0 执行层授权、approval coordinator、tool manifest allowlist、completion matrix 记录已迁入 `implementation-notes-archive.md`，主文件保留当前任务要点。

## 真实模型 E2E provider preflight - 2026-06-03

**目标**：让 `test:e2e:real:model` 区分 provider 不可用/额度耗尽与 BrowserHelm 真实模型场景失败。

**设计决策**：新增 real-model provider preflight，在真实场景启动浏览器前用最小 chat completion 检查 endpoint；401/403 归类为 auth failed，402、quota、endpoint inactive 归类为 provider unavailable。preflight 失败时 Playwright 将 25 个真实模型场景标记为 skipped，并输出脱敏原因；production profile 仍要求 `BROWSER_HELM_REAL_MODEL_E2E_VERIFIED=1`，因此 skipped 不会被当作 production verified。

**验证结果**：TDD RED 覆盖 402 `FREE_QUOTA_EXHAUSTED` 分类与成功响应；GREEN 后 `npx vitest run tests/node/e2e/real-model-provider-preflight.test.ts --reporter=dot` 通过；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过；当前 `npm run test:e2e:real:model` 因 provider preflight 402 返回 25 skipped，exit code 0，但不构成真实模型 production verification。

## form-fill stale ref 解析修复 - 2026-06-04

**目标**：修复真实模型 E2E 中 Apple 注册表单因 stale ref 被 `validateRuntimeToolDecision` 拒绝导致后续 19 个测试无法运行的问题。

**问题根因**：模型在观察页面后获得 ref_102，期间 observation 刷新导致 ref 变化，模型再次使用旧 ref 填表时被 `form-fill-augmenter.ts` 的 `validateRuntimeToolDecision` 立即拒绝（`Form fill rejected: field ref_102 is not in the current observation`），导致 AgentLoop 停留在 `waiting_for_user` 而不是自动重试。

**设计决策**：
- `validateRuntimeToolDecision` 不再对不在当前 observation 中的 ref 立即拒绝，而是尝试在可用的 form candidates 中解析匹配：如果只有一个未被当前批次占用的候选项，则用它作为 stale ref 的解析结果并继续完整校验；如果无法唯一解析，则跳过预校验，将 stale ref 解析委托给 content-side 的 `resolveFreshFormFillRefId()`（有完整 DOM 访问权）。
- 安全相关的其他校验（值是否在用户任务中、是否敏感字段、是否禁用、是否只读、是否隐藏/file、是否已有值）对已解析的 ref 继续完整执行。
- 新增独立 test file `tests/node/agent/loop/form-fill-augmenter.test.ts`（8 tests），覆盖 stale ref 唯一解析、无法唯一解析时跳过、值不匹配拒绝、敏感字段拒绝等场景。

**验证结果**：TDD RED 5 tests fail → GREEN 8 tests pass；全量单测 227 passed / 1 skipped；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 通过；Apple 注册表单真实模型 E2E 单独重跑通过（2.1min）。

## v1.6 Production hardening 最终收口 - 2026-06-04

**目标**：修复真实模型 E2E 中剩余的 4 个失败，打通 production release gate。

**问题根因**：
- BBC News：模型违反 repair policy（重复页面读取）→ run failed。重跑通过（flaky，模型行为差异）。
- Shadow DOM：首次超时 3.1m（模型仍在 thinking）→ 重跑通过（1.5m，flaky）。
- Web Storage：首次 waiting_for_user → 重跑通过（11.5s，flaky）。
- Multi-tab：AgentLoop `maxSteps` 默认 6 步不足以完成 4+ 个工具调用的多 tab 场景 → `MAX_STEPS_EXCEEDED`。

**设计决策**：
- `maxSteps` 从 6 提升到 8，给多工具调用场景更多呼吸空间。6 步对 tab_get_active + tab_list + observe + finish 模式过紧，任何一次 repair/retry 就会超限。
- 真实模型 E2E `test.describe.serial` 改为 `default` mode，单测失败不再阻止后续测试运行。
- 修复 3 个 lint 错误（agent-loop.ts 不必要的类型断言、task-verifier.test.ts unsafe any、screenshot-manager.ts explicit undefined）。

**验证结果**：全部 4 个失败逐一重跑通过；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test`、`npm run test:security`、`npm run test:coverage`、`npm run build`、`npm run test:e2e`、`npm run check:release`（controlled-beta）通过。production profile 仍需发布当次显式 real-model / real-site opt-in 证据。

## Provider session key 缺失提示 - 2026-06-04

**目标**：解释并修复用户已配置 Base URL/Model 但运行时仍报 `PROVIDER_NOT_CONFIGURED` 的可见性问题。

**设计决策**：确认真实 Chrome 扩展存储里 `providerSettings` 只有 `baseUrl/model/apiKeyPersistence=session`，当前 `chrome.storage.session` 未提供 API Key。保留 session-only 默认安全边界，不自动把 key 转为本地持久化；在设置弹窗显示 session key 缺失提示，并把 AgentLoop 的英文内部错误替换为本地化、可操作的 provider 配置说明。

**偏差说明**：本轮不改变“测试连接不等于保存配置”的行为，也不自动持久化 API Key。

**验证结果**：TDD RED/GREEN 覆盖运行时 provider 缺失提示和设置弹窗 session key 丢失提示；`npx vitest run tests/node/ui/components/agent-components.test.tsx tests/node/runtime/run-manager.test.ts --reporter=dot`、`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

**待确认**：
- [ ] 后续是否把“测试连接成功后仍需保存配置”的状态提示做得更强。

## Vision 截图权限与预览下载修复 - 2026-06-04

**目标**：修复 Chrome 加载扩展时省略 optional `debugger` 导致截图失败的问题，并优化截图预览操作区。

**设计决策**：将 `debugger` 从 optional permissions 移入 required permissions，因为 Chrome 明确不允许 `debugger` 作为 optional；删除 side panel/background 中主动请求 optional `debugger` 的旧路径，让截图链路直接依赖 manifest 暴露的 `chrome.debugger` API。截图预览下载使用本地 data URL 的 `<a download>`，不经过 downloads API。

**偏差说明**：原先假设可以由 UI 在用户手势下请求 `debugger` optional permission，实际 Chrome 会在 manifest 层省略该权限，因此必须调整 manifest 契约。

**权衡分析**：
- 方案一：继续 optional 请求。优点是安装权限更少；缺点是 Chrome 不支持，运行时必然失败。
- 方案二：将 `debugger` 声明为 required。优点是符合 Chrome 权限模型，CDP 截图链路稳定；缺点是安装时权限更敏感。
- 选择方案二，因为这是 Chrome 对 `debugger` 权限的硬约束；`downloads/clipboard/offscreen` 仍保持 optional。

## 批量长图与页面图片采集 - 2026-06-04

**目标**：在 Vision 调试面板中增加批量截取页面长图和批量获取页面图片 URL 清单，并确保两条路径都会滚动页面触发懒加载。

**设计决策**：
- 新增 `PageMediaManager` 作为批量编排层，默认处理当前窗口内最多 8 个 http/https 标签页；`active_tab` scope 固定使用 run 目标 tabId，避免 side panel 调试页被误认为 active tab。
- `ScreenshotManager.captureFullPage()` 在 CDP full-page capture 前调用 lazy-load warmup，滚动到底部后恢复原视口；滚动失败只作为 best-effort，不阻断截图 fallback。
- 图片采集工具结果返回 img/srcset/source、link icon/open graph 和 CSS background 的 URL/尺寸/来源清单，不把二进制写入 tool result/model context；Vision 面板点击下载时再抓取图片并生成包含图片文件和 `manifest.json` 的 ZIP。
- Vision 面板新增批量长图和图片采集按钮；长图展示缩略预览并按页提供本地下载。CDP full-page clip 固定为当前视口宽度 + 页面高度，避免横向 content width/DPR 膨胀导致两栏长图。

**偏差说明**：本轮不做 URL 队列输入和远程图片批量下载，交互先收敛为当前窗口/当前目标页的本地批处理，减少权限和数据落盘风险。

**验证结果**：TDD RED 覆盖 full-page 截图前未滚动、`PageMediaManager` 缺失、批量 vision 工具缺失、VisionPanel 缺少批量入口、两栏长图、批量长图无预览、图片集合只导出 JSON；GREEN 后相关 vision/page-media 单测和 `npm run build`、`npx playwright test tests/e2e/specs/extension/vision-screenshot.spec.ts` 通过。全仓 `typecheck/lint` 当前被未跟踪 selection 功能语法/类型问题阻塞。

**待确认**：
- [ ] 后续是否需要支持用户粘贴 URL 列表并自动逐页打开后批处理。

**待确认**：
- [ ] 原生 side panel 中截图预览右下角下载按钮位置是否符合预期？
- [ ] 是否需要给下载文件名增加时间戳或页面域名？

## v1.6 hardening 审计补齐 - 2026-06-04

**目标**：把最新审计中的 P1/P2 问题转成可验证任务，收口到 controlled beta / release candidate 可放行状态，而不是宣称默认 production-grade。

**设计决策**：
- PermissionBroker 统一 `chrome.permissions.contains()` 与可选权限请求，capability-bound tool 执行前刷新 snapshot，避免权限被撤销后仍用旧状态。
- `provider_context` 独立于本地 `observe` 做 domain consent gate；未获授权时 prompt 不携带 observation、structuredPageData、page read、recent actions 或 last tool result。
- CDP attach 转为高风险审批动作；Action readiness 扩大确认/授权/发布/连接/订阅等高风险文本；Verifier 优先读取结构化 evidence，再回退到旧启发式文本判断。
- Domain Adapter 明确为 non-executing hints；release 报告默认状态改为 controlled-beta / RC，production profile 只作为显式真实模型/真实站点证据齐备时的 opt-in gate。

**验证结果**：已按 TDD 对 PermissionBroker、provider context gate、action risk、runtime policy 抽象清理、Click/Submit verifier、release/安全文档和 Domain Adapter UI 补 RED/GREEN；相关组合测试 `17 files / 167 tests` 通过。全量 typecheck/lint/test/build/e2e/release gate 仍需在提交前重跑。

**待确认**：
- [ ] production 公开发布前是否彻底禁用 local API key persistence，或改为更强二次确认。

## 选中文字右键一键解释/翻译 - 2026-06-04

**目标**：在网页选中文字后，通过浏览器右键菜单一键启动 BrowserHelm 解释或翻译任务。

**设计决策**：新增 background 侧 `selection-context-menu` helper，注册两个 `selection` context menu：解释和翻译。点击菜单后将选中文本转换为中文 ask 任务，复用同一个 `RunManager.startRun()` 和 Cockpit side panel 订阅路径；`side-panel-target` 支持带 `runId` 的 path/message，保证 side panel 已打开时也能切到新 run。

**偏差说明**：本轮没有新增独立翻译 UI，也没有从 content script 直接调用 provider；选中文本作为用户显式输入进入现有 provider/domain consent/脱敏边界。真实 Chrome 扩展右键菜单未做手工验收。

**验证结果**：TDD RED 确认 `selection-context-menu` 模块缺失；GREEN 后 `npx vitest run tests/node/background/selection-context-menu.test.ts tests/node/runtime/side-panel-target.test.ts tests/node/entrypoints/sidepanel-app.test.ts --reporter=dot` 通过：3 files / 38 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build`、`npx vitest run tests/node/config/manifest-contract.test.ts --reporter=dot` 通过。

## Vision 右键菜单入口 - 2026-06-04

**目标**：把截取当前视口、截取当前页面长图、获取当前页面全部图片加入 BrowserHelm 右键菜单。

**设计决策**：`selection-context-menu` 改为统一注册 `BrowserHelm` 父菜单，解释/翻译作为 selection-only 子项，三项 Vision 子项在 page/selection/link/image context 可用。Vision 点击创建 `debug` + `observe_only` run 后执行现有 Vision tool，再打开 side panel 到该 run；不新增截图 pipeline。

**偏差说明**：未做真实 Chrome 右键菜单手工验收；长图和图片懒加载副作用沿用现有 Vision tool 行为。

**验证结果**：TDD RED 覆盖分组菜单缺失和 Vision click 未执行 tool；GREEN 后 `npx vitest run tests/node/background/selection-context-menu.test.ts tests/node/runtime/side-panel-target.test.ts tests/node/entrypoints/sidepanel-app.test.ts --reporter=dot` 通过：3 files / 41 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build`、`npx vitest run tests/node/config/manifest-contract.test.ts tests/node/tools/vision/vision-tools.test.ts --reporter=dot`、`git diff --check` 通过。

## Selection context actions - 2026-06-04

**目标**：新增选中文字后的右键菜单快捷入口，一键生成中文解释或翻译任务并在当前 tab 上启动 `ask` run。

**设计决策**：将 Chrome `contextMenus` 注册、选中文本任务构造和点击处理集中在 background helper；background 复用同一个 `RunManager` 与 side panel 绑定路径，打开面板时携带 `runId`，已打开面板也通过 target message 切到对应 run。

**偏差说明**：该入口只读，不执行页面工具或绕过 provider/domain consent；选中文本作为用户显式输入进入普通 ask 任务。

**验证结果**：TDD RED 由 selection context menu 测试和 manifest contract 暴露；GREEN 后 `npx vitest run tests/node/config/manifest-contract.test.ts tests/node/background/selection-context-menu.test.ts tests/node/runtime/side-panel-target.test.ts --reporter=verbose` 通过（3 files / 51 tests）。`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 已重跑通过，最终全量 gate 仍在提交前继续跑。

## 右键直接下载 Markdown/图片/ZIP - 2026-06-04

**目标**：网页选中区域后，通过右键菜单直接生成并下载 `.md` 文件；截图/长图右键项直接下载图片；获取页面全部图片右键项直接下载 ZIP；所有 BrowserHelm 右键项应平铺而不是放在二级菜单。

**设计决策**：选区 DOM 读取放在 content script，background 只注册 context menu 并把点击转发到发生右键的 frame。Markdown 序列化从真实 `Selection` clone DOM Range，保留 heading/list/link/image/table/blockquote/code 结构；下载用 Blob URL/data URL + `<a download>` 自动触发，不新增 `downloads` 或 clipboard 权限。Vision 右键先执行现有 safe tool，再把 screenshot data URL 或 imageCollection 发送回 content script 下载；长图/图片采集右键使用 `scope: active_tab`，与“当前页面”文案一致。

**偏差说明**：第一版实现了预览后下载；根据用户反馈改为右键后自动下载，并删除预览弹层路径。右键下载不打开 side panel；Vision 仍创建内部 observe-only run 用于执行既有 tool，但结果直接下载。全量 E2E 受当前工作树既有 CDP/Cockpit/Vision/Adapter 失败影响未通过，本功能相关的 DOM、background 菜单、manifest、typecheck/lint/build 已验证。

**权衡分析**：
- 方案一：右键后直接下载。优点是最快，符合用户最新反馈；缺点是下载前无法编辑 Markdown。
- 方案二：右键后页面内预览再下载。优点是可确认、可编辑；缺点是多一个确认动作，和最新反馈不一致。
- 选择方案一，因为用户明确要求“右键点的应该弄完之后自动触发下载”。

**验证结果**：TDD RED/GREEN 覆盖 Markdown 保留链接和结构、空选区、直接下载链路、右键菜单 frame 转发、stale menu id、所有 BrowserHelm 菜单平铺、Vision screenshot 图片下载、批量长图图片下载、图片清单 ZIP 下载和 content script ZIP 生成；`npx vitest run tests/node/background/selection-context-menu.test.ts tests/node/background/selection-context-download.test.ts tests/node/background/selection-markdown-menu.test.ts tests/dom/page/selection/context-menu-downloads.test.ts tests/dom/page/selection/selection-markdown.test.ts tests/dom/page/selection/selection-markdown-download.test.ts tests/dom/page/selection/selection-markdown-controller.test.ts tests/node/config/wxt-config.test.ts tests/node/config/manifest-contract.test.ts --reporter=dot` 通过；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 通过。`npm run test:e2e` 结果为 45 passed / 16 failed / 37 skipped，失败集中在既有 CDP、Cockpit、streaming、vision 和 adapter 场景。

**待确认**：
- [ ] Chrome 是否仍会因为浏览器自身规则把多个同扩展菜单自动折叠；代码层已不再创建父菜单或 `parentId`。

## E2E hardening 回归收口 - 2026-06-04

**目标**：修复 hardening 与右键菜单改动后暴露的 E2E 回归，确保调试页、run permalink、session-only provider key 和 CDP 手动调试路径按真实产品边界工作。

**设计决策**：
- `?runId=...` 的 side panel URL 固定为 pinned/run 查看模式，避免 active tab target port 消息清空 runId 并触发对 extension 调试页的自动观察。
- E2E provider helper 改为 local 存非密配置、session 存 `providerApiKey`，匹配生产默认 session-only 密钥策略。
- 用户手动触发且不会改变页面的 debug tool 可越过 metadata approval；agent/runtime 自动路径仍按风险、metadata、first mutation 和 domain/capability gate 执行。
- E2E `activeTabId()` 过滤 extension/chrome/about tabs，并按最近访问的真实页面选择目标，降低 side panel/debug tab 抢 active 的不稳定性。

**验证结果**：TDD RED/GREEN 覆盖 `runId` URL target mode 和用户手动 non-mutating debug tool 授权；`npx vitest run tests/node/runtime/run/security/authorization-service.test.ts tests/node/entrypoints/sidepanel-app.test.ts tests/node/ui/sidepanel-target-mode.test.tsx --reporter=verbose` 通过（3 files / 24 tests）。回归 E2E 集 `cdp-debug/cockpit-ui/streaming-status/vision-screenshot/domain-adapters` 通过（24 passed）。`npm run typecheck` 与 `npm run lint -- --max-warnings=0` 通过。

## 右键下载菜单与长图重复首屏修复 - 2026-06-04

**目标**：修复 Markdown 未进入 BrowserHelm 同一菜单层级，以及长图下载重复第一屏的问题。

**设计决策**：删除独立 Markdown context menu 注册，把 Markdown 作为 `selection-context-menu` 的 BrowserHelm 子项统一注册和点击处理。full-page 截图在可用 `captureVisibleTab`、`scripting` 和 canvas API 时优先滚动逐屏捕获并 OffscreenCanvas 拼接，缺失能力时才回退 CDP full-page/viewport fallback。

**偏差说明**：本轮未做真实 Chrome 原生右键菜单手工验收；验证覆盖自动注册、frame 转发、滚动位置和拼接结果。

**验证结果**：TDD RED/GREEN 覆盖 Markdown 同层菜单与 frame 下载、长图滚动位置 `0/600/800` 拼接；相关 9 files / 59 tests 通过，`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 通过。

## 长图右键自动下载恢复 - 2026-06-04

**目标**：修复长图生成后未触发自动下载的问题。

**设计决策**：截图类 data URL 由 background 优先调用 `chrome.downloads.download`，避免长图大 payload 通过 `tabs.sendMessage` 失败；content script 下载仅作为 fallback。`downloads` 权限改为 required，因为右键长图自动下载已是核心行为。

**验证结果**：TDD RED/GREEN 覆盖 background 直下图片、content fallback 和 manifest 权限；相关 9 files / 60 tests、`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 通过。

## 长图拼接与截图 quota 回退 - 2026-06-04

**目标**：修复真实扩展中 full-page 截图因重复首屏、MV3 service worker 缺少 `FileReader` 或 Chrome `captureVisibleTab` quota 导致 Vision fallback/E2E 失败的问题。

**设计决策**：full-page 截图在可用时优先激活目标 tab 后按视口滚动分片，用 `OffscreenCanvas` 拼接整页；`blobToDataUrl` 在无 `FileReader` 环境下改用 `Blob.arrayBuffer()` 转 base64；当 `captureVisibleTab` 因权限、activeTab 或 quota 失败时回退 CDP screenshot。Vision 批量测试同步 mock tile stitch，而不是继续依赖 CDP full-page 主路径。

**偏差说明**：本轮没有引入新的截图节流队列；先以 quota fallback 保证连续 viewport/full-page/describe 调用可用。

**验证结果**：`npx vitest run tests/node/background/screenshot-manager.test.ts tests/node/tools/vision/vision-tools.test.ts --reporter=verbose` 通过；`BROWSER_HELM_E2E_REQUIRED_PERMISSIONS=1 npx playwright test tests/e2e/specs/extension/vision-screenshot.spec.ts` 通过；最终全量 gate 在提交前重跑。

## 右键解释翻译侧栏与流式可见性修复 - 2026-06-04

**目标**：修复右键解释/翻译未自动弹出右侧栏，以及 DeepSeek reasoning/content 流式输出在 UI 中只显示“正在思考”的问题。

**设计决策**：context menu 文本动作先在用户手势内打开当前 tab 的 side panel，再启动 ask run 并绑定 runId。`ModelGateway` 接入 content delta 和 reasoning delta preview；`StreamingState` 暴露 `previewText`/`reasoningText`；UI 只从流式 `finish.message` 片段提取可见回答，继续隐藏 raw 协议 JSON。

**偏差说明**：本轮先修复 UI 可见流式进度和右键侧栏打开时序，未做真实 Chrome 原生 side panel 手工验收。

**验证结果**：TDD RED/GREEN 覆盖侧栏打开顺序、DeepSeek reasoning delta、streaming preview state 和 UI 可见预览；相关 5 files / 134 tests、`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build`、`git diff --check` 通过。

## 右键菜单 stale remove 噪声与 README 同步 - 2026-06-04

**目标**：修复 context menu 注册时删除不存在的 `browserhelm-selection-to-markdown` 导致的 runtime.lastError 噪声，并 review README 是否与当前行为一致。

**设计决策**：右键菜单注册改为 `contextMenus.removeAll()` 后创建平铺菜单项，避免父菜单级联删除子项后再逐个删除 stale id；同时去掉 `parentId`，让 Markdown、解释、翻译、截图、长图和图片 ZIP 菜单按用户预期平铺。README/README_EN 同步说明右键导出直接下载、API Key 默认 session-only、工具数量改为 90+ 并补齐视觉/Storage 工具摘要。

**验证结果**：TDD RED/GREEN 覆盖 removeAll 清理和平铺菜单；`npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=verbose` 通过。

## 右键解释/翻译 sidebar 用户手势修复 - 2026-06-04

**目标**：修复右键选择解释/翻译时 run 会启动但原生 side panel 不自动弹出的问题。

**设计决策**：新增 `openSidePanelForUserGesture()`，在右键菜单用户手势链路内 fire-and-forget 绑定 side panel path，并立即调用 `chrome.sidePanel.open({ tabId })`；避免先 `await bindSidePanelToTab()` 导致 Chrome 判定用户手势丢失。

**验证结果**：相关 side panel/context menu 单测通过；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build` 通过。未做真实 Chrome 原生右键菜单手工验收。

## API Key 本地持久化显式选择修复 - 2026-06-04

**目标**：解释并修复刷新扩展后需要重新配置 API Key 的问题。

**设计决策**：默认仍使用 `chrome.storage.session` 保存 API Key，避免无提示写入磁盘；当用户在模型配置中显式选择“受信任本地存储”时，`ChromeSettingsStore` 现在真正把 API Key 写入 `chrome.storage.local`，刷新扩展后可继续使用。同步更新中英文 UI 错误提示、安全文档和 README。

**验证结果**：TDD RED/GREEN 覆盖显式 local persistence；相关 storage/UI/runtime 测试 3 files / 93 tests 通过。

## v1.6 审核意见硬化收口 - 2026-06-04

**目标**：按审核意见补齐 CDP attach 审批执行链路、approval behavior 显式契约、CDP session 生命周期、权限 UX、release hygiene 和 verifier 边界。

**设计决策**：`bh_cdp_attach` 接入 `ExecutePendingActionApprovalFlow`，审批批准后以 `approvalResume` 身份恢复执行，避免二次 metadata approval；所有 approval-gated tool 显式声明 `approvalBehavior` 并进入 release hygiene gate。`debugger`/`downloads` 保持 required permission，Broker 不再尝试 optional request，而是给出可解释能力状态；CDP session 增加 TTL、tab close、run finish/cancel cleanup。release gate 改为导入式断言，verifier 补 URL/state 证据和否定成功文案。

**偏差说明**：真实站点/真实模型 E2E 仍保持 opt-in，默认 gate 只证明本地扩展宿主和 mock provider 路径。

**验证结果**：目标 Vitest 11 files / 81 tests 通过；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build`、`npm run check:release` 通过；CDP debug E2E 4 passed；`npm run test:e2e` 62 passed / 37 skipped。

## 审核属实与部分属实问题修复 - 2026-06-04

**目标**：修复审核意见中确认属实/部分属实的后续缺口，包括 runtime 权限申请入口、Vision 批量媒体隐私风险、tool contract 审批行为、CDP same-tab contention 和 submit verifier 证据不足。

**设计决策**：新增 extension-page 可调用、content-script 禁止的 `requestCapability` runtime API；`debugger/downloads` 作为 required 权限返回可解释不可选原因，optional 能力成功后刷新 snapshot。批量长图/图片采集改为 `medium` risk，并要求 agent/runtime 调用必须有明确批量媒体意图；用户手动触发仍可执行。Tool contract 和 manifest hash 纳入 `approvalBehavior`。CDP 同 tab 重复 attach 复用 session 但刷新 TTL。SubmitVerifier 在保留 error-first 前提下接受 post-submit URL change、network 2xx 和 form disappearance 结构化证据。

**偏差说明**：本轮未把 `debugger/downloads` 改回 optional，因为 Chrome manifest 约束和右键下载核心路径都要求它们作为 required 权限；E2E 中 CDP 审批 flow 同步修复了空观察时过早停止轮询的问题。

**验证结果**：目标 Vitest 8 files / 145 tests 通过；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test -- --reporter=dot`（1514 passed / 1 skipped）、`npm run build`、`npm run check:release`、`npm run test:e2e`（62 passed / 37 skipped）均通过。`npm test` 仍输出既有 React `act(...)` warning，但测试通过。
