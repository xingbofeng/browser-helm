## v1.1-v1.6 P0 安全收口首批 - 2026-06-01

**目标**：按外部审计先闭合可独立验证的发布阻断：Full mode 审批语义、表单动作 capability token、工具注册覆盖，以及执行层授权入口。

**设计决策**：Full mode 只扩大工具可见性，不绕过高风险审批；form action token 改为 content handler 内存 nonce，Map miss 直接拒绝；`ToolRegistry.register()` 遇到重名直接抛错；新增 `AuthorizationService` 并接入 `ToolExecutionService`，后续继续扩展 domain/capability/user-intent 判断。

**偏差说明**：本轮只完成 AuthorizationService 第一版，尚未补齐 `changedPageExpected`、`source`、`domainPolicy` 和 `USER_INTENT_MISMATCH` 等完整上下文字段；form token 尚未绑定 frame/origin，后续继续补。

**验证结果**：`npx vitest run tests/node/agent/prompts/safety-policy-prompt.test.ts tests/node/i18n/t.test.ts tests/node/runtime/run/tools/tool-runtime-policy.test.ts tests/node/runtime/run/security/authorization-service.test.ts tests/node/runtime/run/tools/tool-execution-service.test.ts tests/dom/page/messaging/content-rpc-handler.test.ts tests/node/tools/core/tool-registry.test.ts` 通过：7 files / 58 tests；`npm run typecheck` 通过。

## Full 模式与 Agent Loop 目录收敛 - 2026-05-31

**目标**：新增 Full Run Mode，并把真实 Agent loop 收敛到更直白的 `src/agent/loop/`。

**设计决策**：Full 是用户显式选择的高权限模式，合并读取、调试、表单和动作工具可见性；与 Act 不同，Full 不再因 `high` risk 预隐藏工具，也不再由 runtime policy 把 high-risk 工具转成 approval 阻断。现有 active tab、capability、domain、参数校验和工具自身执行错误仍保留。

真实 loop 从 `src/background/runtime/run/` 迁到 `src/agent/loop/`，包含 `agent-loop.ts`、`prompt-builder.ts`、`decision-validator.ts`、`form-fill-augmenter.ts`、`recent-tool-actions.ts`、`runtime-task-state.ts` 和 `types.ts`。`src/background/runtime/run/` 只保留 run 生命周期、store、snapshot/message presenter、tool execution、approval、streaming state 等 extension runtime 外壳。

**偏差说明**：最初考虑 Full 下高风险“可见但仍需 approval”，但需求明确为“高风险也不拦截”，因此最终实现为 high-risk policy bypass。旧 `src/agent/kernel` 原型生产无引用，已删除；历史 roadmap 中 v0.1 Agent Kernel 记录保留为历史，不改写过去。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过，仍有既有 `i18next/no-literal-string` warnings，0 errors。
- `npm test` 通过：962 passed / 1 skipped。
- `npm run build` 通过。
- `npm run test:e2e` 通过：38 passed / 7 skipped。

**待确认**：
- [ ] Full 下工具自身返回 `requiresApproval` 的场景是否也要统一旁路，还是仅旁路 runtime high-risk policy？

## 近期代码简化记录 - 2026-05-31

**目标**：降低高体积 UI/runtime/page 模块的维护成本。

**设计决策**：
- `AgentMessageList` 的 run progress / run flow trace 推导和渲染拆到 `run-flow-status.tsx`。
- `form-fill-dom.ts` 抽出 `skippedField`、`fillTextControl`、`fillContentEditable` 等 helper，减少 input / textarea / contenteditable 重复逻辑。
- `infer-fill-plan-engine.ts` 抽出 skipped field 构造，保持填表计划生成更直白。
- runtime prompt 压缩链路删除无实际变换效果的空包装 helper，保留真正有语义的裁剪和脱敏步骤。
- `content-rpc-handler.ts` 的表单填写、批量填写、校验、提交和 ref 高亮拆成私有 helper，并用响应类型约束替代宽泛断言。

**待确认**：
- [ ] 是否继续拆 `content-rpc-handler.ts` 的 page/a11y/form 分发。
- [ ] 是否继续拆 `run-flow-status.tsx` 的 trace selector。

## 代码简化续扫（runtime / page messaging / approval UI） - 2026-05-31

**目标**：继续扫描当前仓库中体量较大、重复 helper 较多的 runtime、page messaging 和 UI approval 代码，做低风险行为保持型简化。

**设计决策**：
- `content-rpc-handler.ts` 的 page read 和 viewport/stability DOM 逻辑拆到 `page-read-dom.ts`、`viewport-dom.ts`，handler 保留消息分发和权限边界。
- `runtime-task-state.ts` 成为 task state 初始化、模型更新、工具结果同步和 prompt compact 的单一来源，避免 `prompt-builder.ts` 与 runtime loop 各自维护清洗规则。
- submit approval payload 解析抽到 `submit-approval-preview.ts`，`ApprovalDrawer` 与 `CockpitApp` 复用同一解析入口。
- `content-rpc-strategies.ts` 合并重复的 frame ref prefix helper，并避免同一帧 formFields 多次解析。
- 移除 submit approval 工具和 stale digest helper 中不必要的 eslint 例外。

**偏差说明**：扫描时发现当前 worktree 已将真实 loop 迁到 `src/agent/loop/`，因此只修测试 import 和新目录内的相对路径，不恢复旧 `src/background/runtime/run/*` loop 文件。

**验证结果**：
- `npm run typecheck` 多轮通过。
- `npm run lint -- --quiet` 通过。
- 已跑相关单测：runtime run manager / prompt builder / decision validator、page messaging、approval UI、form approval stale digest、form tools 等目标测试均通过。

**待确认**：
- [ ] 是否把 `agent-message-list.tsx` 的页面摘要派生逻辑继续拆成独立 selector。
- [ ] 是否把 `content-rpc-strategies.ts` 的 frame ref 编解码独立成小模块供测试直接覆盖。

## 历史归档 - 2026-05-31

**目标**：把主文件从 1445 行压回可维护范围。

**设计决策**：原 `implementation-notes.md` 全量迁移到 `implementation-notes-archive.md`，不丢弃历史条目。主文件只保留最近和高频决策。

**验证结果**：
- `wc -l implementation-notes.md implementation-notes-archive.md` 用于确认行数。

## Agent Loop 命名简化 - 2026-05-31

**目标**：把迁移期命名 `UnifiedRuntimeAgentLoop` / `unified-runtime-agent-loop.ts` 简化为长期可维护的 `AgentLoop` / `agent-loop.ts`。

**设计决策**：`unified` 和 `runtime` 描述的是历史合并过程与调用方边界，不是 loop 自身职责；长期抽象使用 `AgentLoop`，文件使用项目 kebab-case 约定 `agent-loop.ts`。`RunLifecycleService` 继续作为 runtime 外壳持有 `agentLoop` 实例。

**验证结果**：
- `npm run typecheck` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：58 passed。

## 代码简化续扫（UI 派生逻辑 / DOM action helper） - 2026-05-31

**目标**：继续拆解大文件中混杂的纯逻辑和 DOM helper，让组件、handler 和状态推导各回到更单一的职责。

**设计决策**：
- `agent-message-list.tsx` 只保留消息瀑布渲染、滚动和卡片 UI；消息过滤、页面摘要派生、fallback 消息、最终 provider 文本补全等纯逻辑移到 `agent-message-derivations.ts`。
- `cockpit-app.tsx` 保留 side panel 交互编排；run 状态映射、消息合并、conversation history、空 structured data 和本地错误消息移到 `cockpit-state.ts`。
- `content-rpc-handler.ts` 保留 RPC 分发和权限 token 消费；元素高亮、iframe 文本写入、敏感输入判断、resolved element 描述和 opaque token 生成移到 `element-action-dom.ts`。
- `agent-loop.ts` 小幅减少 finish / mode switch 分支中重复读取 snapshot 的代码；同时修正 `run-lifecycle-service.ts` 对 loop 新文件名的 import。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：135 files passed / 1 skipped，962 tests passed / 1 skipped。

**待确认**：
- [ ] 是否继续拆 `agent-loop.ts` 的模型请求/repair 分支。
- [ ] 是否继续拆 `content-rpc-strategies.ts` 的 frame ref 编解码模块。

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

## 2026-06-01 主文件瘦身归档摘要

**来源**：`implementation-notes.md` 在 2026-06-01 达到 295 行；继续追加本轮收口记录会超过维护阈值，因此将较早的主文件历史条目收起到本 archive。

**归档范围**：
- v1.4 Vision / Screenshot Agent：DOM/a11y 为主路径，vision/CDP screenshot 和 pointer fallback 保持安全边界；当时验证包含 typecheck、lint、tool docs 和 vision E2E。
- v1.5 Advanced Browser Tools 起步与收尾：tab/shadow/download/file/upload/doc/PDF/clipboard 工具按任务相关性与权限动态暴露；本地文件读取、上传 handoff 和剪贴板读写保持 approval。
- Floating Panel E2E 稳定性修复：只收敛测试等待逻辑，不改变产品运行时。
- Review P0/P1 收口修复：submit token 绑定 submitTargetRefId/formRefId，PromptBuilder 裁剪 interactive items，README/release hygiene 修正 provider/API key/page-health 描述。
- v1.6 Domain Adapters：adapter 只提供站点知识、workflow/locator hint 与 failure report，真实动作继续走通用工具、risk 和 approval 边界。

**主文件保留策略**：`implementation-notes.md` 继续保留维护规则、真实模型 E2E 扩展、successCriteria、review 收口、v1.6 adapter review、v1.2-v1.6 当前补全和最终验证记录。

## 2026-06-01 主文件第二次瘦身归档摘要

**来源**：`implementation-notes.md` 在 2026-06-01 再次达到 309 行；继续追加 P0 approval coordinator 记录前，将较早的真实模型 E2E 扩展与 successCriteria 门控记录迁移到 archive。

**归档范围**：
- 真实站点与真实模型 E2E 扩展：`test:e2e:real` 默认走真实模型 suite，12 个真实站点覆盖 provider streaming、model decision、正文/可见文本读取、低风险字段填写和 trace 落盘；第三方写入场景仍需显式 domain policy。
- successCriteria 完成门控审查修复：显式 successCriteria 在 observe/fallback 和模型 finish 时保留并作为硬门控，不满足时 run 转为 `waiting_for_user`；默认 mode criteria 仍作为提示以保持 ask/observe 兼容。
- Review P1/P2 全量审查补齐：ToolSelector 与 direct `executeTool` 对普通外部域名写入/诊断 hook 要求 explicit consent，prompt tool schema 改为紧凑摘要，manifest 移除 `assets/*` web-accessible 暴露，并新增本地 `setup:pre-push` 入口。

**主文件保留策略**：`implementation-notes.md` 继续保留维护规则、review 收口、v1.6 adapter review、v1.2-v1.6 当前补全、最终验证和正在推进的 P0 安全闭环记录。

## 2026-06-02 主文件第三次瘦身归档摘要

**来源**：`implementation-notes.md` 在继续推进 P0-1.6 前为 293 行；为给新的 approval coordinator 记录留出空间，将 2026-06-01 较早的 v1.6 adapter review、v1.2-v1.6 验收补齐、真实模型 E2E 拆分与最终验证记录归档为摘要。

**归档范围**：
- v1.6 Domain Adapter Review：adapter 禁用后 registry/snapshot/prompt 回退到 generic，workflow failure 自动记录，Cockpit enabled 状态有 E2E 覆盖。
- v1.2-v1.5 验收补齐：同域 workflow preview/replay、成功 run workflow draft 和 iframe 公共点击真实写动作补齐。
- 真实模型 E2E 分层与长对话拆分：24 个真实模型场景按 P0/P1/P2 聚合，真实站点长任务拆入独立 scenario runner。
- v1.2-v1.6 Review/最终验证：domain policy、workflow replay approval、PDF 页码范围、self-approval 工具边界和真实模型/扩展回归均完成当轮验证。

**主文件保留策略**：`implementation-notes.md` 继续保留维护规则、当前 P0/P1/P2 严格验收、近期用户反馈修复和正在推进的 P0 安全闭环记录。

## 2026-06-02 主文件第四次瘦身归档摘要

**来源**：`implementation-notes.md` 在完成 v1.2 Task 3.2 前为 293 行；为继续追加当前 v1.2 收口记录，将较早的 Advanced Storage 与分层 Domain Policy 详细记录归档为摘要。

**归档范围**：
- Advanced Storage 与分层 Domain Policy：`bh_storage_list/get` 只读脱敏，`bh_storage_set/delete/clear_with_approval` 通过 `StorageApprovalFlow` 审批后执行，storage mutation 不泄露原始值。
- Domain operation policy：observe 允许普通域只读注入；debug hook、form fill、submit/storage read 和 advanced action 默认要求显式 domain consent。
- 当轮验证曾覆盖 storage 工具、content RPC、approval flow、扩展 E2E、typecheck、build、lint、release hygiene 和真实模型失败用例定向回归。
- v1.2 Task 3.2 memory trust 与隐私控制：MemoryRepo 保存和 lookup 要求非空 domain；无 domain 时不注入 memory/workflow/scratchpad；MemoryViewer 增加 clear all 并接入 side panel；secret-looking task/summary/tags/workflow args 通过 redaction 保证 password/token/OTP/payment/provider key/clipboard text 不落 raw 值。

**主文件保留策略**：`implementation-notes.md` 继续保留维护规则、近期用户反馈修复、P0 安全闭环和当前 v1.1/v1.2 completion task 记录。

## GitHub CI 单测隔离修复 - 2026-06-01

**目标**：修复 GitHub Actions `CI / Typecheck, Lint & Unit Tests` 在 `tests/node/ui/components/agent-components.test.tsx` 中偶发点错 Debug drawer 按钮，导致 Vision tab 断言失败。

**设计决策**：将该测试文件的 `button()` helper 改为支持传入当前 `container`，涉及 Debug drawer 和 model config 的点击都限定在当前 render 容器内；同时新增 `openDebugDrawer()`，若 Debug tabs 已因 `localStorage` 持久化处于展开状态，则不再重复点击标题导致反向关闭。

**偏差说明**：未改产品组件行为；这是测试隔离修复。

**权衡分析**：
- 方案一：调整等待时间或增加更多 `act()` flush。优点是改动少；缺点是不能解决全局 DOM 查询可能点到错误按钮的问题。
- 方案二：把交互查询限定到当前测试容器，并让 Debug drawer 打开操作对已展开状态幂等。优点是更贴近测试隔离边界，且兼容 `localStorage` 保留 open 状态；缺点是需要改多个 helper 调用点。
- 选择方案二，因为 CI 日志显示按钮查找/点击范围不够稳定，二次 CI 也证明 open 状态持久化会让标题点击变成关闭操作。

**验证结果**：
- `npx vitest run tests/node/ui/components/agent-components.test.tsx --reporter=verbose` 通过：1 file / 11 tests。
- `npm test` 通过：183 files passed / 1 skipped，1183 tests passed / 1 skipped。

**待确认**：
- [ ] 推送后确认 GitHub Actions 新 run 通过。

## v1.2 Task 3.1 workflow replay 前后置条件 - 2026-06-02

**目标**：补齐 workflow replay 的执行前页面匹配和执行后完成证据，避免 workflow 只因为步骤工具返回 ok 就被记为成功。

**设计决策**：`WorkflowRepo` 保存 domain、origin、URL pattern、页面 title/text hints、key ref hints、tool manifest hash、adapter id/version 和 completion evidence；preview 会把当前页面 context 的 unmet preconditions 展示给审批卡。`WorkflowReplayApprovalFlow` 在 approval 后、第一步前重新从 snapshot 计算 preconditions，不匹配则返回 `WORKFLOW_PRECONDITION_FAILED` 且不执行步骤；步骤执行后再按 completion evidence 检查 snapshot，缺失则返回 `WORKFLOW_POSTCONDITION_FAILED` 并计 failure。runtime domain adapter snapshot 增加可选 `version`，供 workflow binding 校验。

**偏差说明**：本轮只闭合 workflow replay pre/postcondition；adapter 自身的 version/drift metadata 仍留给 Task 7.2，Task 3.2 memory privacy 尚未开始。

**验证结果**：`npx vitest run tests/node/storage/workflow-repo.test.ts tests/node/runtime/run/workflow-replay-approval-flow.test.ts tests/node/ui/components/memory-replay-components.test.tsx --reporter=verbose` 通过：3 files / 12 tests；`npm run typecheck` 通过。

## v1.1 Task 2.4 UI acceptance states - 2026-06-02

**目标**：补齐 v1.1 UI 验收态，让页面摘要、表单提交卡和 Cockpit E2E 能稳定覆盖 no form、valid/invalid form、disabled submit、console/network、approval required/denied/stale 以及窄侧栏布局。

**设计决策**：`AgentMessageList` 在页面观察统计里追加轻量 state signals，来源保持在现有 `structuredPageData.forms` 与 `bh_debug_collect_page_health` 的 snapshot tool result，不新增 runtime contract。`FormActionCard` 按错误码区分 submit approval required、user denied 和 approval context stale。E2E 用 sidepanel debug tab 做 390px 窄宽度截图和横向溢出断言，并通过 `chrome.sidePanel.getOptions` 验证 native side panel 绑定到目标 tab 的产品 path。

**偏差说明**：headless Chrome for Testing 无法可靠截图系统原生 side panel 宿主；本轮自动化验证 native path/binding，最终发布前仍保留人工确认原生宿主 resize/关闭交互。

**验证结果**：`npx vitest run tests/node/ui/components/agent-components.test.tsx tests/node/ui/lib/merge-elements-forms.test.ts tests/node/ui/sidepanel/cockpit-app.test.tsx tests/node/ui/styles/cockpit-css.test.ts tests/node/runtime/side-panel-target.test.ts tests/node/i18n/t.test.ts` 通过：6 files / 49 tests；`npm run build` 通过；`npx playwright test tests/e2e/specs/extension/cockpit-ui.spec.ts` 通过：11 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`git diff --check` 通过。
## 2026-06-02 主文件归档补充

- `implementation-notes.md` 为追加 v1.4 Task 5.3 记录，移出了 2026-06-01 的 “YouTube 动态搜索框 stale 收口与失败用例定向回归” 长条目；该条目属于早期真实站点/真实模型 E2E 扩展后续修复，完整验证命令包括定向 YouTube real-model E2E、普通 E2E、typecheck、lint、unit 和 release check。
- `implementation-notes.md` 为追加 v1.5 Task 6.3 记录，移出了 2026-06-01 的 “过时验收报告后续修复：release hygiene 与存储边界文档” 条目；该条目补齐 `.output` 路径级 release hygiene 和 README/architecture storage 边界，验证包含 `check:release-hygiene`、typecheck、lint、release check 和 diff check。
- `implementation-notes.md` 为追加 v1.6 Task 7.2 记录，移出了 2026-06-01 的 “面板内置截图入口与 vision 正则门禁收口” 条目；该条目补齐 Cockpit 直接截图入口、vision unavailable 文案和任务文本正则门禁删除，验证包含 Vision/Cockpit 单测、typecheck、lint、diff check、cockpit-ui 定向 E2E 和 vision-screenshot E2E。

## v1.1-v1.6 P0 Approval Coordinator fail-closed - 2026-06-01

**目标**：继续收口 P0-1.6，避免用户批准后在 pending action 缺失、错 run 或错 tool 时仍执行副作用 approval flow。

**设计决策**：新增 `ApprovalCoordinator` 作为 flow 执行前的事务边界，统一校验 request runId、pending action runId/tool、deny 清理和 stale expire；`ApprovalService` 只在 coordinator 成功后才调用 `onApproved`，side-effect flow 缺少匹配 pending action 时返回 `APPROVAL_CONTEXT_STALE` 且不改变页面。

**偏差说明**：本轮只完成 fail-closed 和第一层 coordinator 抽取；approve/deny 的幂等响应、显式 run generation 绑定、TTL/resume/audit 全量迁移仍保留在 P0-1.6 后续项。

**验证结果**：approval coordinator/service 与 clipboard/storage/workflow/form stale 相关定向测试通过：6 files / 24 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

**待确认**：
- [ ] 是否把 stale approval 在 UI 中展示为“请重新验证”而不是普通 failed 状态。

## v1.1-v1.6 P0 页面 mutation 意图门控续补 - 2026-06-01

**目标**：继续收口 P0-1.3，把“页面文本诱导点击/填写”不能变成新动作目标的规则下沉到执行层。

**设计决策**：`ToolExecutionService` 在构造授权上下文时为 `bh_form_fill_field` / `bh_form_fill_many` 生成 `userIntent`，要求每个填写值都能在用户任务中找到明确来源；未明确提供的值返回 `USER_INTENT_MISMATCH`，不会执行 content RPC。已有 click/pointer 首次 mutation approval 继续作为未验证页面动作的兜底。

**偏差说明**：本轮补的是执行层 direct form fill 防线、click grounding 与 prompt-injection mutation 回归；未扩大到完整模型决策层 prompt injection suite。

**验证结果**：`npx vitest run tests/node/runtime/run/security/prompt-injection-mutation.test.ts tests/node/runtime/run/tools/tool-execution-service.test.ts -t "prompt injection|public click actions|direct form fill"` 通过：2 files / 6 tests；`npm run test:e2e -- tests/e2e/specs/extension/prompt-injection.spec.ts` 通过：2 passed；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`git diff --check` 通过。

**待确认**：
- [ ] 后续是否把真实模型 prompt injection suite 也升级为 mutation 非执行断言。

## v1.1-v1.6 P0 verifier finish gate 收口 - 2026-06-02

**目标**：闭合 P0-1.5 专用完成门控，避免模型在页面动作、表单提交或 workflow replay 后缺少后验状态证据仍直接 finish。

**设计决策**：保留 explicit `successCriteria` 文本门控作为兼容 fallback；新增 trace 顺序 verifier，要求 `requiresObserve` 页面动作后有成功 `bh_page_observe`，`FORM_SUBMIT_RESULT` 后有 post-submit observe，`bh_flow_run_with_approval` 后有 `bh_flow_score` 成功证据。AgentLoop 传递 `source: 'agent'`，运行时直接执行默认 `runtime`，避免把人工调试工具调用误判成模型页面指令。

**验证结果**：`tests/node/agent/verification/task-verifier.test.ts`、`tests/node/runtime/run-manager.test.ts`、`tests/node/runtime/run/workflow-replay-approval-flow.test.ts` 全文件通过：82 tests；P0 security/approval 定向 64 tests 通过；prompt-injection 扩展 E2E 2 passed；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`git diff --check` 通过。

## 2026-06-03 主文件第五次瘦身归档摘要

从 `implementation-notes.md` 主文件移出 2026-06-01/02 的 P0 执行层授权与 verifier、Approval Coordinator 幂等/generation、Approval Request 恢复、Approval audit 收敛、Tool manifest allowlist、Approval request 创建收敛、Milestone 0 completion matrix 条目。主文件继续保留维护规则、归档索引和 2026-06-02 之后仍高频参考的 v1.1-v1.6 任务要点。

## 2026-06-04 主文件第七次瘦身归档

### v1.5 Task 6.2 高级可变动作边界 - 2026-06-03

**目标**：让 iframe/pointer/click approval preview 带上 origin/frame/ref 上下文，并强制 cross-origin iframe mutation 同时满足显式用户意图与 approval。

**设计决策**：`AuthorizationService` 统一用 `buildActionPreview()` 生成审批预览，附加 target、frame、ref、origin、pageOrigin 和 crossOrigin。cross-origin iframe mutation 即使目标文本已在用户任务中显式出现，也会进入 approval；若没有显式意图则先 fail closed 为 `USER_INTENT_MISMATCH`。隐藏内部 `bh_iframe_click/type` 继续不进入公开工具集，直调时只创建审批请求，不执行 content RPC。

**偏差说明**：计划里的 `tests/e2e/specs/extension/iframe-action-policy.spec.ts` 当前不存在；本轮使用现有 `page-observation.spec.ts` 覆盖 iframe 读取、普通 iframe click、高风险内部 iframe tool 审批边界。

**验证结果**：TDD RED 覆盖 approval preview 缺少 frame/ref/origin、cross-origin 显式意图仍直跑、hidden iframe tool preview 贫瘠；GREEN 后 `npx vitest run tests/node/runtime/run/security/advanced-action-policy.test.ts tests/node/runtime/run/security/authorization-service.test.ts tests/node/runtime/run/tools/tool-execution-service.test.ts tests/node/tools/action/action-tools.test.ts tests/dom/page/messaging/content-rpc-handler.test.ts --reporter=dot` 通过：5 files / 60 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build && npx playwright test tests/e2e/specs/extension/page-observation.spec.ts` 通过。

### v1.5 Task 6.3 File/Download/Doc/PDF 边界 - 2026-06-03

**目标**：补齐下载元数据脱敏、PDF/doc page range / scanned / unavailable / truncation metadata，以及复杂 PDF 支持边界说明。

**设计决策**：`DownloadManager` 对下载 URL path 和 basename 也走模型上下文脱敏，避免 email、provider key 或下载 token 出现在 tool data/context。`DocumentManager` 保持内置 PDF 文本扫描器，不引入新 parser 依赖；当选中页面内容流带 `/Filter` 且无可抽取文本时，返回 `unavailableReason: pdf_filter_unsupported` 和 parser limitation，明确复杂/压缩 PDF 不在当前支持范围。

**偏差说明**：本轮选择显式记录复杂 PDF 限制，而不是引入完整 PDF parser 依赖；后者会扩大 bundle 和测试面，留待用户确认真实需求后再做。

**验证结果**：TDD RED 覆盖下载 URL/path secret 泄漏和 filtered PDF 缺少 unavailable reason；GREEN 后 `npx vitest run tests/node/background/download-manager.test.ts tests/node/background/document-manager.test.ts tests/node/tools/file/file-tools.test.ts tests/node/tools/doc/doc-tools.test.ts --reporter=dot` 通过：4 files / 14 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build && npx playwright test tests/e2e/specs/extension/advanced-file-tools.spec.ts tests/e2e/specs/extension/advanced-doc-tools.spec.ts` 通过。

### v1.5 Task 6.4 Clipboard/Storage approval UX - 2026-06-03

**目标**：补齐剪贴板和 Web Storage 敏感动作的 approval UX，确保审批前不读写、预览不泄露原始 text/value，拒绝或 stale approval 不改变浏览器状态。

**设计决策**：保留 pending action 内部原始参数用于批准后执行，但执行层 `argsPreview` 和 approval `actionPreview` 只暴露长度、area/key 与 masked preview。剪贴板读取批准后的 `ToolResult.data.sensitiveText` 仍给受控调用链使用，模型上下文和 snapshot detail 改为长度摘要与 sanitizer mask，避免 raw clipboard text 进入持久化或上下文压缩。

**验证结果**：TDD RED 覆盖 clipboard read 原文进入 `context.summary`；GREEN 后 `npx vitest run tests/node/runtime/run/clipboard-approval-flow.test.ts tests/node/runtime/run/storage-approval-flow.test.ts tests/node/runtime/run/tools/tool-execution-service.test.ts tests/node/tools/clipboard/clipboard-tools.test.ts tests/node/tools/storage/storage-tools.test.ts tests/node/tools/core/tool-args-redaction.test.ts --reporter=dot` 通过：6 files / 44 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm run build && npx playwright test tests/e2e/specs/extension/advanced-clipboard-tools.spec.ts tests/e2e/specs/extension/advanced-storage-tools.spec.ts` 通过。

### v1.6 Task 7.1 DomainAdapter 范围决策 - 2026-06-03

**目标**：确认 v1.6 adapter 的产品边界，避免把 guidance/workflow/locator hints 误读为可直接执行动作或绕过审批的站点执行器。

**设计决策**：保留 `DomainAdapter` 名称，但定义为非执行型站点增强；类型层新增 `DOMAIN_ADAPTER_RUNTIME_CONTRACT`，明确 execution model 为 `non_executing_hints`，并列出后续必须实现的 versioning、locator verification、drift detection、failure reporting 和 policy composition。UI 文案改为 workflow/locator hints，并强调全局 approval policy 仍强制执行。

**验证结果**：TDD RED 覆盖缺少 adapter runtime contract 和 UI 文案夸大；GREEN 后 `npx vitest run tests/node/adapters/adapter-types.test.ts tests/node/adapters/registry.test.ts tests/node/tools/adapter/adapter-tools.test.ts tests/node/ui/components/domain-adapter-status.test.tsx tests/node/i18n/t.test.ts --reporter=dot` 通过。

### v1.6 Task 7.2 Adapter version/drift metadata - 2026-06-03

**目标**：补齐 adapter version、verified date、URL pattern、required signals、drift checks 和 locator failure metadata，让 adapter 失败可追踪并能明确 generic fallback。

**设计决策**：`createSiteAdapter()` 统一给首批 skeleton 注入 `1.0.0`、`2026-06-03`、`https://domain/*`、`url_domain_match` 和默认 drift check；`detect()` 返回 `driftStatus: not_checked` 与 generic fallback reason，后续 fixture/page signal 测试再把 drift check 从 metadata 升级为实测 pass/fail。locator/workflow failure report 现在记录 adapter version 与 matched URL pattern。

**验证结果**：TDD RED 覆盖缺少 version/drift status 和 locator failure metadata；GREEN 后 `npx vitest run tests/node/adapters/registry.test.ts tests/node/tools/adapter/adapter-tools.test.ts --reporter=verbose` 通过；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

### v1.6 Task 7.3 per-adapter fixture tests - 2026-06-03

**目标**：为 GitHub、Gmail、Notion、Linear、Jira、Stripe、Vercel、Supabase 建立 fixture 级回归，证明 adapter 检测、guidance/workflow/locator、禁用、failure fallback 和 approval invariant 都不是单一 happy path。

**设计决策**：新增 8 个 `tests/fixtures/adapters/*/index.html` 和 8 个 `tests/node/adapters/*-adapter.test.ts`，共用 fixture contract helper。测试直接读取落盘 fixture，匹配 locator candidate，空候选触发 versioned failure report；禁用 adapter 时验证 runtime snapshot 和 prompt 只保留 generic fallback，不注入 workflow/guidance。`approvalRequiredResult()` 补充 `changedPage:false` 和 `requiresObserve:false`，adapter workflow preview 不会伪装成页面动作。

**验证结果**：TDD RED 覆盖 fixture 缺失、snapshot 缺少 version、adapter workflow approval result 未声明页面不变更；GREEN 后 `npx vitest run tests/node/adapters/*.test.ts tests/node/tools/adapter/adapter-tools.test.ts tests/node/runtime/run/prompt-builder.test.ts tests/node/ui/components/domain-adapter-status.test.tsx --reporter=dot` 通过：13 files / 70 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

### v1.6 Task 7.4 Adapter UI failure visibility - 2026-06-03

**目标**：补齐 Cockpit adapter 状态卡，让 drift fallback 和最近一次 adapter failure 对用户可见，同时保留禁用/重新启用路径。

**设计决策**：runtime adapter snapshot 现在带 `driftStatus` 与 `lastFailure`；`DomainAdapterStatus` 在启用状态下展示 drift 状态、generic fallback reason、最近失败错误码和 locator/workflow id。最近失败来自 `defaultAdapterFailureReporter` 的同 adapter 最新 report，仍只作为可见诊断，不改变工具执行策略。

**验证结果**：TDD RED 覆盖 UI 不显示 drift/last failure、snapshot 缺少 lastFailure；GREEN 后 `npx vitest run tests/node/adapters/*.test.ts tests/node/tools/adapter/adapter-tools.test.ts tests/node/runtime/run/prompt-builder.test.ts tests/node/ui/components/domain-adapter-status.test.tsx tests/node/i18n/t.test.ts --reporter=dot` 通过：14 files / 84 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

## 截图 debugger 权限申请 - 2026-06-04

**目标**：修复截图时 "chrome.debugger permission or API is unavailable" 错误，向用户主动申请 debugger 可选权限。

**设计决策**：三层防御
1. **主防线 (sidepanel UI)**：`cockpit-app.tsx` 的 `runVisionPanelTool` 执行前，调用 `chrome.permissions.request({ permissions: ['debugger'] })` 弹窗申请。sidepanel 有用户手势，弹窗可正常展示。
2. **次防线 (screenshot-manager)**：`captureVisible()` 和 `captureFullPage()` 在回退到 CDP 前调用 `ensureDebuggerPermission()`。background SW 可能无用户手势，但作为防御措施。
3. **底防线 (debugger-manager)**：`attach()` 检测 API 不可用时最后一搏请求权限，try-catch 包裹静默失败。

**关键决策**：
- `chrome.permissions.request()` 需要用户手势，所以主要权限弹窗必须在 sidepanel 发起，不能依赖 background SW
- `ensureDebuggerPermission()` 返回 `boolean` 而非抛异常：UI 层拿到 false 后显示友好 i18n 提示
- `debugger` 在 manifest 中已是 `optional_permissions`，无需修改 manifest

**修改文件**：
- `src/ui/sidepanel/cockpit-app.tsx` — 新增 `ensureDebuggerPermission()`
- `src/background/screenshot-manager.ts` — 新增 `captureWithDebugger()` / `ensureDebuggerPermission()`
- `src/background/debugger/debugger-manager.ts` — 新增 `requestDebuggerPermissionIfNeeded()`
- `src/i18n/locales/zh.ts` / `en.ts` — 新增 `vision.panel.debuggerPermissionDenied`

**验证**：tsc 编译通过，1424 测试全绿。
## 2026-06-04 主文件第九次瘦身归档：Task 8.1-8.3

从 `implementation-notes.md` 移入 Task 8.1 RunManager 服务拆分、Task 8.2 AgentLoop pipeline 拆分、Task 8.3 PromptBuilder responsibility 拆分三条明细。主文件继续保留当前右键菜单、流式 UI、E2E hardening 和最近问题修复记录。

### Task 8.1 RunManager 服务拆分 - 2026-06-03

目标是在不改变 RuntimePort 外部行为的前提下，把 provider、domain policy、memory/workflow snapshot enrichment 和 tool execution composition 从 `RunManager` 拆到聚焦服务。新增 `ProviderService`、`DomainPolicyService`、`MemoryWorkflowService` 和 `ToolExecutionFacade`，`RunManager` 继续保留 run 生命周期编排与订阅通知；服务通过依赖注入接收 repo/client factory，避免测试触达真实 provider 或外部网络。验证：TDD RED/GREEN，相关 runtime services/run-manager 测试、typecheck、lint 通过。

### Task 8.2 AgentLoop pipeline 拆分 - 2026-06-03

目标是在保留 provider streaming、repair、工具执行和 finish verification 行为的前提下，把 `AgentLoop` 中的模型请求、上下文构建、决策校验、finish 评估和 task state 同步拆成聚焦模块。新增 `ModelGateway`、`ContextAssembler`、`DecisionPipeline`、`TerminationEvaluator` 和 `TaskStateReducer`；`AgentLoop` 保留 run turn 编排、trace 写入、repair loop 和 snapshot 状态转换。验证：相关 agent loop、runtime、prompt-builder 组合测试、typecheck、lint 通过。

### Task 8.3 PromptBuilder responsibility 拆分 - 2026-06-03

目标是在保持 prompt 行为稳定的前提下，把 stable system policy、dynamic context、budget compaction 和 tool manifest serialization 从 `PromptBuilder` 中拆成可测试模块。新增 `SystemPolicyBuilder`、`DynamicContextBuilder`、`ContextCompactor` 和 `ToolManifestPromptSerializer`；tool manifest prompt 明确使用 `toolManifestHash()`，并保留紧凑 args schema 与稳定排序。验证：相关 prompt/agent loop/runtime 测试、typecheck、lint、build、diff check 和 release check 通过。

## 2026-06-04 主文件第十次瘦身归档：Task 9.1-9.2

从 `implementation-notes.md` 移入 Task 9.1 Security regression suite、Task 9.2 Coverage gate 渐进提升两条明细。主文件继续保留最终验证、真实模型诊断、右键菜单、流式 UI 和最近问题修复记录。

### Task 9.1 Security regression suite - 2026-06-03

**目标**：把分散的 P0/security 回归集中到一个可执行入口，并补齐 extension security spec 目录，避免 release 前漏跑关键安全场景。

**设计决策**：新增 `tests/node/security/security-suite-config.test.ts` 作为 suite 清单守门员，要求 `npm run test:security` 覆盖 prompt injection mutation、full mode approval、form token forgery、approval race/capability unavailable、XSS markdown、page-health nonce、memory redaction、workflow precondition mismatch 和 adapter disabled prompt exclusion。新增 `tests/e2e/specs/extension/security/prompt-injection-security.spec.ts` 复用现有 flow 验证真实扩展宿主中的提示注入不触发点击、填写或提交。

**验证结果**：TDD RED 先确认 `npm run test:security` 缺失，再确认脚本缺少 E2E security 入口；GREEN 后 `npm run test:security` 通过：node 11 files / 82 tests，extension security E2E 2 passed，并包含一次 `npm run build`。

### Task 9.2 Coverage gate 渐进提升 - 2026-06-03

**目标**：先把安全关键模块纳入文件级 coverage gate，不一次性抬高全局阈值导致虚假阻塞。

**设计决策**：全局阈值维持 statements 30、branches 20、functions 25、lines 30；新增 authorization、approval coordinator、form action token handler、tool registry、workflow replay approval flow 和 shared redaction 的文件级阈值。`docs/roadmap/readme.md` 明确 release readiness 需要 `test:security` 与 `test:coverage`。

**验证结果**：TDD RED 覆盖缺少文件级 thresholds；GREEN 后 `npx vitest run tests/node/config/coverage-thresholds.test.ts --reporter=verbose`、`npm run typecheck`、`npm run lint -- --max-warnings=0` 和 `npm run test:coverage -- --reporter=dot` 通过。

## 2026-06-04 主文件第十一次瘦身归档：Task 9.3 与 v1.6 hardening 收口

从 `implementation-notes.md` 移入 2026-06-03 的 Task 9.3 最终 release verification 和 v1.6 production hardening 收口记录。主文件继续保留真实模型诊断、右键菜单、流式 UI 和最近问题修复记录。

### Task 9.3 Final v1.1-v1.6 verification - 2026-06-03

**目标**：完成最终 release verification，并把 completion matrix 从 partial/missing 状态清零。

**设计决策**：`docs/audits/v1-1-v1-6-completion-matrix.md` 现在将 48 个 roadmap AC 标为 done，P0 gate 保持 closed；real-sites/real-model E2E 保持 opt-in，不在未配置 `BROWSER_HELM_REAL_SITE_E2E`、`BROWSER_HELM_REAL_MODEL_E2E` 和 provider credentials 时作为默认 gate。

**验证结果**：`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test`、`npm run test:coverage -- --reporter=dot`、`npm run build`、`npm run test:e2e`、`npm run check:release` 均通过。`npm run test:e2e` 结果为 60 passed / 37 skipped；skipped 均为 real-sites/real-model opt-in 用例。

### v1.6 Production hardening 收口 - 2026-06-03

**目标**：按 v1.6 production hardening 任务收口语义完成验证、运行时能力、source trust、密钥持久化、权限、domain consent、安全覆盖、adapter 真实性、截图 fallback、workflow/postcondition 和 release profile gate。

**设计决策**：完成 verifier family 与 `TerminationEvaluator` 集成，finish 需要 answer/form/submit/navigation/click/workflow/debug 的语义证据；Chrome 能力来自 real probe，缺失能力 fail closed；公开 runtime 消息不再信任 caller-provided source，background/agent/approval/replay 路径显式标注 source；provider key 默认 session-only，持久化需显式 opt-in；默认 manifest 只保留基础权限，高风险能力进 optional，E2E profile 才提升 required；未知域名 provider context 需显式 consent；adapter 仅声明 non-executing hints；release check 报告 controlled-beta profile。

**偏差说明**：真实模型 opt-in E2E 仍被外部 provider 阻塞，trace 显示 `model_stream_failed: Model stream request failed with status 402`，fallback 后 run 停在 `observed`，不能作为 production real-model gate 通过证据。

**验证结果**：`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test -- --reporter=dot --silent`、`npm run test:security`、`npm run test:coverage -- --reporter=dot --silent`、`npm run build`、`npm run test:e2e`、`npm run check:release` 均通过；`npm run test:e2e` 为 60 passed / 37 skipped；coverage summary 为 statements 87.7%、branches 77.61%、functions 94.47%、lines 88.54%；真实模型定向用例未通过，原因是 provider HTTP 402。

**待确认**：
- [ ] 修复 provider 402/额度后重跑 `BROWSER_HELM_REAL_MODEL_E2E=1` 的真实模型套件，作为 production release gate。
## 真实模型 provider 402 诊断可见性 - 2026-06-03

**目标**：确认 `.env.development` 中真实模型 API key 是否加载正确，并避免真实模型失败时只留下 `{}` / `observed` 状态。

**设计决策**：直接调用 `https://tokenhub.tencentmaas.com/v1/chat/completions` 验证 key 与 model；当前 `deepseek-v4-flash` 返回 `FREE_QUOTA_EXHAUSTED`，而其他测试 model 返回 `model not found`，说明 key 和 model 路由被服务端识别，阻塞来自 MaaS endpoint 免费额度耗尽/端点 inactive。`OpenAICompatibleClient` 现在保留脱敏后的 provider 错误体；`ModelGateway` 在 stream 与 fallback completion 都失败时返回结构化 `fail` decision，让 run 进入 `failed` 并展示可操作错误。

**验证结果**：真实模型定向 E2E 现在快速失败为 `MODEL_REQUEST_FAILED: endpoint is inactive: FREE_QUOTA_EXHAUSTED | 401008 | gateway_error`，不泄露 API key；`npm run typecheck`、`npm run lint -- --max-warnings=0`、相关 provider/model gateway/runtime 单测、`npm test -- --reporter=dot --silent`、`npm run build && npm run check:release` 均通过。

## 真实模型 deepseek-v4-pro 切换与 read-fields 恢复 - 2026-06-03

**目标**：使用可用的 Tencent MaaS 模型继续真实模型 E2E，并修复真实模型跳过显式只读工具导致 max steps 的空转。

**设计决策**：`.env.development` 的 `OPENAI_MODEL` 从 `deepseek-v4-flash` 切到 `deepseek-v4-pro`；同一 key/endpoint 下 `deepseek-v4-pro` 最小 chat completion 返回 200，`deepseek-v4-flash` 返回 `FREE_QUOTA_EXHAUSTED`。`AgentLoop` 在 finish 被 semantic gate 拦住且缺失的是允许自动恢复的只读显式工具时，会以 `source: runtime` 自动执行一次 `bh_form_read_fields`，随后让模型下一轮 finish；高风险/可变工具不走该恢复路径。

**验证结果**：`BROWSER_HELM_REAL_MODEL_E2E=1 npx playwright test tests/e2e/specs/real-sites/real-model-api.spec.ts --grep "低敏注册表单填写" --timeout=360000` 通过：1 passed / 54.6s；`npm run typecheck`、`npm run lint -- --max-warnings=0`、相关 AgentLoop/model/provider/runtime 单测、`npm run build && npm run check:release` 均通过。

## v1.6 Production hardening 缺口补齐 - 2026-06-03

**目标**：补齐 production hardening 审计中确认的 adapter drift、API key persistence UI、workflow structured invariants 三个硬缺口。

**设计决策**：adapter drift 不再固定 `not_checked`，`DomainAdapterRegistry.detect()` 可接收 DOM/fixture 侧 `observedSignals`，默认用 URL domain match 生成 `ok`，观测信号冲突时返回 `drift_suspected` 与 `missingSignals`，仍保留 generic fallback。模型设置 UI 明确展示 session/local API key storage 选择，默认 `session`，`local` 继承已有设置或用户显式选择，并显示本地持久化风险提示；runtime provider settings schema 同步接受 `apiKeyPersistence`。Workflow memory 新增结构化 `preconditions`/`postconditions`，支持 URL、DOM state、form value、text、adapter signal assertion；replay precheck/postcheck 现在返回 structured verifier results，postcondition fail 仍计为 workflow failure。

**偏差说明**：DOM state assertion 当前依赖 snapshot refs 的 `disabled` 字段；更复杂的 CSS/ARIA 状态还没有扩展为独立 assertion 类型。

**权衡分析**：
- 方案一：保留旧字符串 hints 并新增结构化 invariants，兼容现有 workflow memory。
- 方案二：一次性迁移旧字段到新 schema，语义更统一但风险更大。
- 选择方案一，因为 production hardening 需要补强验收语义，同时不能破坏已有 memory/replay 数据。

**验证结果**：TDD RED 覆盖 adapter drift `not_checked`、provider `apiKeyPersistence` 被 runtime schema 丢弃、设置 UI 无本地持久化风险提示、workflow structured invariant API 缺失、replay postcondition 缺少 structured result；GREEN 后 `npx vitest run tests/node/adapters/*.test.ts tests/node/tools/adapter/adapter-tools.test.ts tests/node/runtime/run/run-snapshot-assembler.test.ts tests/node/ui/components/domain-adapter-status.test.tsx tests/node/runtime/runtime-messages.test.ts tests/node/ui/components/agent-components.test.tsx tests/node/storage/chrome-settings-store.test.ts tests/node/storage/workflow-repo.test.ts tests/node/runtime/run/workflow-replay-approval-flow.test.ts tests/node/ui/components/memory-replay-components.test.tsx --reporter=dot` 通过：19 files / 118 tests；`npm run typecheck`、`npm run lint -- --max-warnings=0` 通过。

**待确认**：
- [ ] 全量 `npm test`、`npm run test:security`、`npm run test:coverage -- --reporter=dot`、`npm run test:e2e` 仍需在最终 release gate 前重跑。
