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
