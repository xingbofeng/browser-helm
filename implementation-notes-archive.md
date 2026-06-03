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
