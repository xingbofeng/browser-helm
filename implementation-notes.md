## implementation-notes 维护规则 - 2026-05-31

**目标**：主文件只保留当前高频规则、最近任务要点和待确认项；历史完整记录迁移到 `implementation-notes-archive.md`。

**设计决策**：
- `implementation-notes.md` 控制在 300 行以内，超过时继续归档。
- 新任务完成后只追加高信号决策、偏差、验证和待确认，不复制长测试日志。
- 需要完整历史时查 `implementation-notes-archive.md`。

**待确认**：
- [ ] 后续是否按月份继续拆分 archive，例如 `implementation-notes-archive-2026-05.md`。

## Action Readiness 重复检查修复 - 2026-05-31

**目标**：分析 `browserhelm-trace-run_8-20260531.jsonl` 中 Act 模式反复检查 Quickstart 链接却不前进的问题，并防止同类 run 走到 max steps。

**设计决策**：
- 根因是模型把 `bh_action_check_readiness` 的 OK 结果误当成“点击会发生/已经发生”；该工具实际是只读动作前检查，不修改页面。
- `bh_action_check_readiness` 的 summary 和工具描述显式写明 “no action was executed / 不会执行该动作”。
- prompt 在最近一次 readiness 后加入边界 guidance：不要在页面未变化或 refs 未刷新时重复检查同一目标；没有单独执行工具时应 finish 并说明边界。
- `decision-validator` 增加硬保护：同一页面上相同 `kind + refId` 的 readiness 已成功后，重复决策进入 repair，不再触发第二次工具执行。

**偏差说明**：没有新增真实点击工具；本次只修复 readiness 被模型误用导致的循环。是否开放通用链接点击/导航执行能力需要单独对齐审批、风险和工具命名。

**验证结果**：
- 新增回归测试覆盖重复 readiness repair。
- `npm test -- tests/node/runtime/run-manager.test.ts -t "repairs repeated action readiness"` 通过。
- `npm test -- tests/node/runtime/run/prompt-builder.test.ts` 通过。
- `npm test -- tests/node/runtime/run/decision-validator.test.ts tests/node/tools/action/action-tools.test.ts tests/node/shared/schemas/action-readiness.test.ts` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：59 passed。
- `npm run typecheck` 通过。
- `npm run lint -- --quiet` 通过。
- `npm run build` 通过。

**待确认**：
- [ ] 是否需要为非表单链接点击新增单独 public action execution 工具，还是继续保持 Act 只做 readiness/表单低风险执行。

## Tool Status 与 Ask User 顺序修复 - 2026-05-31

**目标**：分析 `browserhelm-trace-run_8-20260531 (1).jsonl` 中 UI 显示“需要你的补充”在 `bh_action_check_readiness` 工具卡上方的原因，并修复瀑布流顺序误导。

**设计决策**：
- trace 真实顺序是先 `bh_action_check_readiness`，后模型返回 `ask_user`；UI 反序来自 `RunManager.withRunMessages()` 在 terminal snapshot 中根据最新 `toolResult` 追加派生工具状态消息。
- 新增 `upsertToolStatusMessage()`，当当前 run 已有 ask/final/recommendation/error/provider 回复时，把工具状态卡插到该回复前；已有工具卡仍原位更新，不制造重复消息。
- 保持 trace、toolResult 和 AgentLoop 决策语义不变，本次只修 user-facing waterfall 的派生消息顺序。

**偏差说明**：本次没有新增真实点击工具；`帮我点击` 仍会先做只读 readiness，然后因为没有公开点击执行工具而请求用户手动处理或补充。

**验证结果**：
- 新增回归测试覆盖 tool status 在 ask_user 前展示。
- `npm test -- tests/node/runtime/run-manager.test.ts -t "orders tool status before ask_user"` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/runtime/run/prompt-builder.test.ts tests/node/runtime/run/decision-validator.test.ts tests/node/tools/action/action-tools.test.ts tests/node/shared/schemas/action-readiness.test.ts` 通过：84 passed。
- `npm run typecheck` 通过。
- `npm run lint -- --quiet` 通过。
- `npm run build` 通过。

**待确认**：
- [ ] 是否需要进一步把 action readiness 的工具卡标题从默认“工具 bh_action_check_readiness”改成更可读的“动作就绪检查”。

## Act 模式普通点击执行工具 - 2026-05-31

**目标**：修复“帮我点击”只检查 readiness、不自动点击的问题，让普通链接/按钮点击在 Act 模式下可被模型真实执行。

**设计决策**：
- 新增公开工具 `bh_action_click`，仅在 Act 模式暴露，执行链为 `A11Y_RESOLVE_REF -> IFRAME_ACTION_AUTHORIZE -> IFRAME_CLICK`，复用已有 content-script token 授权和 frame 路由。
- 工具执行前复用 `checkResolvedActionReadiness`。普通中风险目标可点击；不可见、disabled、ref 过期或高风险目标不执行。
- 高风险点击目前返回 `APPROVAL_REQUIRED` 并明确 `click was not executed`，不接入默认 approval flow，因为默认 approval 只记录决定，不会自动执行动作。
- `bh_action_check_readiness` 仍保持只读职责，并补充敏感字段归一化，避免漏判高风险。

**偏差说明**：本次只开放普通 click；提交、支付、删除、上传、发送等高风险点击仍需要后续设计专门 approval flow。

**验证结果**：
- 新增工具单测覆盖顶层 ref 点击、iframe ref 点击和高风险阻断。
- 新增 runtime 回归测试覆盖 Act 模式下模型调用 `bh_action_click` 会走到真实 `IFRAME_CLICK`。
- `npm test -- tests/node/tools/action/action-tools.test.ts tests/node/runtime/run-manager.test.ts tests/node/agent/modes/tool-selector.test.ts tests/node/tools/iframe-frame-naming.test.ts tests/node/tools/frame/iframe-tools.test.ts` 通过：82 passed。
- `npm run typecheck` 通过。
- `npm run lint -- --quiet` 通过。
- `npm run build` 通过。

**待确认**：
- [ ] 是否需要为高风险点击新增专门 approval flow，让用户批准后重新校验并执行。

## v1.2 Memory / Workflow / Replay 骨架与 ESLint Warn 修复 - 2026-05-31

**目标**：补齐 v1.2 本地记忆、scratchpad、workflow/replay 基础能力，并把 ESLint warning 压到 0，避免 UI 被 memory 查询副作用污染。

**设计决策**：
- 新增 `bh_memory_*`、`bh_pad_*`、`bh_flow_*` 工具族，先使用本地 repo 与 schema 保护契约，所有写入走脱敏策略。
- Agent prompt 只注入经过 domain policy 和预算裁剪的 memory/scratchpad/session summary，避免长页面读取被 memory 上下文挤掉。
- MemoryViewer 不再通过 `executeTool(bh_memory_list)` 自动拉取数据；改为由 `RunSnapshot.memory` 被动携带当前 domain memory，保留当前 `toolResult` 和 debug trace。
- Workflow replay 先实现 preview/approval/step/score 的受控骨架；高风险 replay 默认需要用户批准。

**偏差说明**：当前 memory/workflow repo 仍是内存实现，尚未落到 IndexedDB/Dexie；session persistence 也先提供接口与 in-memory 实现，后续需要接 `chrome.storage.session`。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。
- `npm run test:node -- tests/node/runtime/run/run-store.test.ts tests/node/ui/components/memory-replay-components.test.tsx` 通过，实际覆盖 131 files passed / 1 skipped，795 tests passed / 1 skipped。
- `npm run build` 通过。
- `npm run test:e2e` 通过：38 passed / 7 skipped。
- 真实 Chrome for Testing 扩展会话验证：basic form 自动观察可见；MemoryViewer 显示后台写入的 domain memory；高级面板当前工具仍为 `bh_page_observe`，未被 `bh_memory_save/list` 覆盖。

**待确认**：
- [ ] 是否把 memory/workflow repo 从内存实现切到 IndexedDB/Dexie。
- [ ] 是否把 run session persistence 从 in-memory 接到 `chrome.storage.session`。
- [ ] 是否继续实现完整 workflow replay runner，而不是当前 preview/approval/step 骨架。

## v1.2 持久化与 Workflow Replay Runner 收口 - 2026-05-31

**目标**：把 v1.2 从内存骨架推进到可验收状态：memory/workflow/scratchpad 落 IndexedDB，run session 状态落 `chrome.storage.session`，workflow replay 批准后按步骤执行。

**设计决策**：
- Repo 保留同步内存索引，启动时从 Dexie/IndexedDB 水合，写入、删除和评分异步镜像到 `browser-helm-v1-2`，避免把 AgentLoop/prompt builder 全链路改成 async。
- `RunManager` 默认接 `ChromeStorageRunSessionPersistence`；没有 Chrome session storage 的测试/Node 环境 fallback 到 in-memory。
- session persistence 记录 snapshot summary、pending action 和 audit events；pending action 带 generation id 与 TTL，过期不恢复。
- `WorkflowReplayApprovalFlow` 接入 approval registry。用户批准 `bh_flow_run_with_approval` 后，runner 逐步调用 runtime `executeTool`，保留 mode gate、tool args 校验和二次 approval 边界；不可用工具会失败而不是绕过策略。
- `WorkflowStep` 增加可执行 `args`，`argsPreview` 继续用于展示；两者写入前都脱敏。

**偏差说明**：IndexedDB 水合是异步镜像模式，不阻塞 repo 构造；极早期启动瞬间可能先看到空内存索引，随后水合完成。完整 service worker 重启恢复已通过 storage 层和真实浏览器 session 写入验证，未做强制杀死 worker 后恢复 UI 的自动化脚本。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。
- `npm test` 通过：153 files passed / 1 skipped，1008 tests passed / 1 skipped。
- `npm run check:release` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：38 passed / 7 skipped。
- 真实 Chrome for Testing 扩展验证：MemoryViewer 空/命中状态可见；memory 和 workflow rows 写入 IndexedDB；ReplayPreview 可见；`chrome.storage.session` 写入 pending action 与 audit event；批准后 workflow replay 执行 `bh_page_observe` 并以 `bh_flow_run_with_approval` finished。

**待确认**：
- [ ] 是否追加一个专门的 E2E spec 覆盖 workflow replay approval runner，而不是仅保留 node 单测 + 真实浏览器手工脚本验证。
- [ ] 是否为高风险 workflow step 增加更细的 per-step preview UI，而不只依赖当前整体 replay approval + runtime policy。

## v1.3 DevTools/CDP Deep Debug - 2026-05-31

**目标**：实现 v1.3 DevTools/CDP 深度调试能力，覆盖 debugger attach/detach、network/console/performance/event listeners/request detail、Deep Inspect UI、敏感信息脱敏和 page-health opt-in fallback。

**设计决策**：
- 新增 `src/background/debugger/`，由 `DebuggerManager` 统一管理 `chrome.debugger` attach 状态和 Network/Runtime/Performance 事件缓存。
- 新增 `bh_cdp_*` 工具族，仅在 Debug/Full 语义下可用；attach/detach 为 medium risk，只改变扩展 debugger 状态，不直接修改页面。
- Request/response headers、console 文本、request/response body preview 和 URL query/hash 在进入 tool result、trace、UI 前做脱敏；敏感 headers/cookies/token/API key 默认显示 `[MASKED]`。
- `page-health-hook.js` 不再默认注入；`bh_debug_collect_page_health` 在 Debug mode 下按需启用临时诊断 hook，且 postMessage 前后都对 URL path/query/fragment 和 provider secret 做脱敏。
- Side panel 新增 Deep Inspect tab，展示 request inspector、performance metrics 和 console event panel；所有新增 UI 文案走 i18n，`eslint --max-warnings=0` 保持为 0。

**偏差说明**：CDP deep tools 需要 manifest `debugger` 权限。当前 Deep Inspect 以最近一次 CDP tool result 展示对应面板，不做跨工具历史聚合；跨 request 的持久 inspector 状态可后续再做。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。
- `npm test` 通过：157 files passed / 1 skipped，1020 tests passed / 1 skipped。
- `npm run check:release` 通过，工具清单校验为 65 个工具一致，manifest 权限文档校验为 7 required / 3 optional / 4 resources documented。
- `npm run build` 通过。
- `npm run test:e2e` 通过：38 passed / 7 skipped。
- 真实 Chrome for Testing 扩展验证：`bh_cdp_attach` 成功 attach fixture tab；捕获 2 个 network request、2 个 console events、36 个 performance metrics；request detail 可读；缺失 requestId 的 response body 返回 unavailable；Authorization/header/token 在 tool result 和 Deep Inspect UI 中显示为 `[MASKED]`；`bh_cdp_detach` 成功释放 debugger。

**待确认**：
- [ ] 是否为 Deep Inspect 增加跨 CDP 工具结果的持久聚合视图，而不只展示最近一次结果。
- [ ] 是否把 CDP 真实浏览器验证脚本固化为专门 E2E spec。

## v1.4 Vision / Screenshot Agent - 2026-05-31

**目标**：实现 v1.4 screenshot capture、vision summary、overlay/layout issue 检测、DOM/a11y fallback、pointer fallback 和 Vision Panel，并补齐 node 与 E2E 覆盖。

**设计决策**：
- DOM/a11y 仍是主路径；vision 工具只在视觉歧义、遮挡、布局异常或 DOM fallback 场景进入 ToolSelector。
- `ScreenshotManager` 优先使用 `chrome.tabs.captureVisibleTab`，当 sidepanel 自动化路径缺少 `activeTab`/host permission 时，使用既有 `debugger` 权限经 CDP `Page.captureScreenshot` fallback，不新增必选 host permission。
- Vision provider 通过 `ModelClient.completeVision` 接入；provider 不支持时返回 `VISION_UNAVAILABLE` + `fallback: dom_a11y`，runtime 保持 run 为 observed。
- `bh_pointer_click` 仅作为视觉 fallback 最后手段；普通坐标点击可用 CDP mouse event fallback，支付/提交/删除/密码/上传等敏感 reason 直接 approval required，不执行点击。
- 原始 screenshot `dataUrl` 不进入 trace payload；snapshot detail 统一脱敏为 `[MASKED_IMAGE_DATA]`。

**偏差说明**：`bh_vision_capture_full_page` 已改为 CDP full-page capture；当 CDP 不可用时才回退可见视口。Vision Panel 展示最近一次 vision tool result，不做跨 run/跨工具视觉历史聚合。

**验证结果**：
- RED 覆盖：screenshot-manager、vision-client、vision tools、vision result normalizer、pointer tools、tool selector、VisionPanel、runtime vision fallback、snapshot dataUrl 脱敏与 E2E。
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。
- `npm run check:tool-docs` 通过，工具清单为 72 个。
- `npm run test:e2e -- tests/e2e/specs/extension/vision-screenshot.spec.ts` 通过：2 passed，覆盖 viewport/full-page screenshot、vision fallback、VisionPanel 和 pointer approval。

**待确认**：
- [ ] 是否增加 Vision Panel 的跨工具历史列表，而不是只展示最近一次 vision 结果。

## v1.5 Advanced Browser Tools 起步：Tab Tools - 2026-05-31

**目标**：开始 v1.5 高级浏览器工具，先完成多 tab 工作流的基础上下文能力：列出 tab、读取 active tab、切换焦点 tab。

**设计决策**：
- 先实现 `bh_tab_list`、`bh_tab_get_active`、`bh_tab_focus`，作为后续 frame/shadow/file/doc/clipboard 的地基。
- Tab URL 在工具结果中移除 query/hash，只保留 origin + pathname，避免 token、搜索参数或页面 fragment 进入 trace/model context。
- `bh_tab_focus` 只切换已有 tab 焦点，不点击页面内容、不提交数据，标为 `low` risk；执行后 `requiresObserve: true`，强制重新观察新目标。
- 工具 mode 使用 `advanced`，当前可通过 Full mode 暴露；后续 v1.7 RuntimeStrategy 会把 Advanced mode 的动态暴露规则收敛到统一策略层。

**偏差说明**：本轮只完成 v1.5 T1 的 tab-manager/tab tools，尚未实现 frame/shadow/file/doc/clipboard、download-manager 或 PDF/doc tools。

**验证结果**：
- `npx vitest run tests/node/background/tab-manager.test.ts tests/node/tools/tab/tab-tools.test.ts` 通过：2 suites / 7 tests。
- `npm run test:e2e -- tests/e2e/specs/extension/advanced-tab-tools.spec.ts` 通过：1 passed，真实 Chrome for Testing 扩展中打开两个 fixture tab，验证 list 脱敏和 focus 切换。
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。

**待确认**：
- [ ] v1.5 下一步优先补 frame/shadow 读取，还是先补 download/file/PDF 工具链。

## v1.5 Advanced Browser Tools：Shadow DOM 只读工具 - 2026-05-31

**目标**：补齐 v1.5 T3 的 Shadow DOM 只读能力，让 agent 能发现并读取 open shadow root 中 DOM/a11y 主路径可能漏掉的控件。

**设计决策**：
- 新增 `bh_shadow_list` 和 `bh_shadow_query`，仅支持 open shadow root；closed shadow root 不尝试绕过浏览器封装边界。
- content runtime 新增 `BH_SHADOW_LIST` / `BH_SHADOW_QUERY` RPC，由页面侧读取 host selector、文本预览、交互数量和元素摘要。
- Shadow 工具只读、`safe` risk，不执行点击/输入；后续如果要支持 shadow 内动作，必须复用 approval/risk/stale target 边界。
- host selector 优先使用 `id`，无 id 时使用 tag + nth-of-type fallback；工具结果只保留元素摘要，不保存 DOM 原文树。

**偏差说明**：本轮没有实现 shadow 内 mutating action，也没有为 closed shadow root 提供特殊处理；这符合 v1.5 的权限和安全边界。

**验证结果**：
- RED：`tests/node/page/shadow/shadow-dom.test.ts` 与 `tests/node/tools/shadow/shadow-tools.test.ts` 先失败于缺模块。
- GREEN：Node targeted tests 通过：2 suites / 5 tests。
- 真实扩展 E2E：`npm run test:e2e -- tests/e2e/specs/extension/advanced-shadow-tools.spec.ts` 通过：1 passed。
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过。

**待确认**：
- [ ] shadow 内点击/输入是否等 v1.5 action policy 完整后再加。

## Floating Panel E2E 稳定性修复 - 2026-05-31

**目标**：修复全量 E2E 中 floating panel icon/收起用例偶现抢跑，避免 content script 尚未挂载 shadow DOM 时测试直接 evaluate 导致失败。

**设计决策**：只调整 E2E flow，不改产品代码。新增统一等待 floating host + `.entryButton` ready 的 helper，所有 shadow DOM 点击、tooltip、图片和 iframe host 断言先等待按钮存在；图片断言等待资源进入 loaded/error 终态后再检查 `naturalWidth/naturalHeight`。

**偏差说明**：这是测试稳定性修复，不改变 floating panel 运行时行为。

**验证结果**：
- `npm run test:e2e -- tests/e2e/specs/extension/floating-panel.spec.ts` 通过：9 passed。
- `npm run lint -- --max-warnings=0` 通过。
- `npm run test:e2e` 通过：45 passed / 7 skipped。

**待确认**：
- [ ] 是否把 floating panel flow 中其他重复 host 查询继续收敛为更小的 Page Object。

## v1.5 Advanced Browser Tools 完成收尾 - 2026-06-01

**目标**：完成 v1.5 高级浏览器工具版本范围，补齐 tab/frame/shadow/download/file/upload/doc/PDF/clipboard 工具边界、动态工具选择策略、真实扩展 E2E 覆盖，并把 E2E 描述统一改为中文。

**设计决策**：
- Download/File/Doc/Clipboard 继续保持工具边界清晰：下载列表和文档提取只读；本地文件读取、文件上传 handoff 和剪贴板读写必须走 approval。
- `bh_file_upload_with_approval` 只创建审批边界，不读取本地路径、不自动设置 file input；批准后仍由用户通过浏览器文件选择器完成真实文件选择。
- Clipboard 通过 MV3 offscreen document 桥接 `navigator.clipboard`，并保留 `execCommand` fallback，解决真实扩展自动化里 offscreen 文档可能不处于 focused 状态的问题。
- `selectToolsForRun` 对 advanced 工具族做任务相关性和权限门控，避免 tab/shadow/doc/download/file/clipboard 工具在无关任务里进入模型上下文。
- Prompt builder 将 runtime decision guidance 放在用户 JSON 前缀，避免大工具契约截断关键指导；fixture server 同步兼容此前缀后再解析 JSON。
- E2E spec 层只保留场景意图描述，所有 `test` / `test.describe` 标题改为中文句式；DOM、CDP、API、URL、产品名和属性名保留为技术标识。

**偏差说明**：v1.5 没有实现本地文件任意写入、自动设置 file input、closed shadow root 读取或剪贴板免审批访问；这些能力会扩大权限和隐私风险，不纳入本版本。真实站点冒烟用例仍默认 skip，避免 CI/本地验证依赖第三方站点稳定性。

**权衡分析**：
- 方案一：把所有 advanced 工具始终暴露给模型。优点是实现简单；缺点是上下文膨胀、误调用风险高。
- 方案二：按任务文本、manifest capability 和风险等级动态选择工具。优点是上下文更小、权限边界更清楚；缺点是 selector 需要更多测试覆盖。
- 选择方案二，因为 v1.5 工具族已经明显变宽，动态加载策略能直接降低模型误用高级权限的概率。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint -- --max-warnings=0` 通过，ESLint warning 为 0。
- `npm test` 通过：176 files passed / 1 skipped，1085 tests passed / 1 skipped。
- `npm run check:release` 通过：83 个工具名与 README 一致；release hygiene 通过；manifest permissions 为 11 required / 3 optional / 4 resources documented。
- `npm run test:e2e` 通过：51 passed / 4 skipped，真实 Chrome for Testing 扩展宿主覆盖 tab/shadow/doc/file/upload/clipboard/CDP/vision/floating panel/cockpit/streaming/page observation；剩余 skipped 为真实第三方站点 opt-in 冒烟。

**待确认**：
- [ ] 是否在 v1.6 继续把 workflow replay approval runner 固化为专门 E2E。
- [ ] 是否为 Form Doctor / Page Inspector 这类产品化英文 UI 名称增加中文别名。
