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
