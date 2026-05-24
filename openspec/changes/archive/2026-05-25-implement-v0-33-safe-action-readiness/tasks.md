## 1. Schema 与 Run Mode

- [x] 1.1 为 `ActionIntent`、`ActionReadiness`、action kind、risk/wouldRequireApproval、changedPage/staleRefs/requiresObserve 编写失败优先的 shared schema 测试。
- [x] 1.2 实现 action readiness 相关 shared schema 和类型导出，确保敏感输入只允许 mask preview 进入可见 payload。
- [x] 1.3 为 `runModeSchema` 增加 `act` 编写测试，覆盖默认 ask、显式 act 和未知 mode 拒绝。
- [x] 1.4 实现 `act` run mode，并提供 run mode 中英文双语 label：询问 / Ask、调试 / Debug、表单 / Form、动作准备 / Act。
- [x] 1.5 为 action kind 和 risk label 编写测试，覆盖点击 / Click、输入 / Type、选择 / Select、提交 / Submit、聚焦 / Focus，以及安全 / Safe、低风险 / Low、中风险 / Medium、高风险 / High。

## 2. Action Readiness 核心

- [x] 2.1 为 `checkActionReadiness` 编写 DOM/page 单测，覆盖有效 ref、stale ref、目标不可见、目标 disabled、动作类型不匹配。
- [x] 2.2 实现 `src/page/dom/action-readiness.ts`，复用现有 ref 解析、interactive/form 状态和 element state reader。
- [x] 2.3 为 page change detector 编写测试，覆盖 URL/origin/title/frame URL/frame 可达性明确变化时 `requiresObserve=true`。
- [x] 2.4 实现保守 `page-change-detector`，不做复杂 DOM diff，失败时返回结构化 readiness 结果而不是抛未处理异常。
- [x] 2.5 为风险预判编写测试，覆盖普通 click/type 为 low/medium，submit/send/delete/payment/upload/clipboard/execute_js/password/token/otp/API key 升级 high 或 `wouldRequireApproval=true`。
- [x] 2.6 实现 action readiness 风险预判和 next hints，保证 readiness 工具本身不创建 ApprovalRequest。

## 3. Action Tool

- [x] 3.1 为 `bh_action_check_readiness` 编写 Node 工具测试，覆盖 canAct、stale ref、requiresObserve、wouldRequireApproval 和 `debug/act` modes。
- [x] 3.2 新增 `src/tools/action/bh-action-check-readiness.ts`，工具 risk 为 low，ToolResult 标记只读状态。
- [x] 3.3 同步 `src/tools/README.md`，加入 `bh_action_check_readiness` 的 title、目录、mode、risk、参数和含义。
- [x] 3.4 更新 prompt/tool surface 测试，证明 `bh_action_check_readiness` 在 act/debug 可见，在 ask/form 边界下按规则裁剪。

## 4. Frame / iframe RPC 基础

- [x] 4.1 为复合 refId 解析编写单测，覆盖 `frame_<id>:ref_<id>`、无 frame 前缀、非法 frame id 和显式 frameId 不一致。
- [x] 4.2 实现 frame ref 解析 helper，作为 iframe read/click/type 的统一入口。
- [x] 4.3 扩展 content RPC schema，新增 iframe read/click/type 请求和成功/失败响应 schema。
- [x] 4.4 为 content RPC frame 路由编写测试，覆盖目标 frame 可达、frame 不存在、frame content script 不可用和 frame 导航后 stale。
- [x] 4.5 实现 background/content frame 路由，复用现有 all-frames 注入与 per-frame 容错逻辑。

## 5. Frame Tools

- [x] 5.1 将 `bh_frame_list` 实现文件迁移到 `src/tools/frame/`，保持工具名、参数和返回语义兼容。
- [x] 5.2 更新工具自动注册、测试引用和 `src/tools/README.md`，确保 `bh_frame_list` 目录变更不破坏现有调用。
- [x] 5.3 为 `bh_iframe_read` 编写 Node 工具测试，覆盖有效 iframe ref、frame 不可达、ref stale 和 `debug/act` modes。
- [x] 5.4 实现 `src/tools/frame/bh-iframe-read.ts`，工具 risk 为 low，不触发 approval，不修改页面状态。
- [x] 5.5 为 `bh_iframe_click` 编写 Node/DOM 测试，覆盖 readiness 通过、readiness 阻断、policy approval 阻断和成功后 `changedPage=true/requiresObserve=true`。
- [x] 5.6 实现 `src/tools/frame/bh-iframe-click.ts`，默认 risk 为 medium，执行前强制调用 readiness 和 policy。
- [x] 5.7 为 `bh_iframe_type` 编写 Node/DOM 测试，覆盖普通输入、敏感输入 mask、readiness 阻断、policy approval 阻断和成功后 requiresObserve。
- [x] 5.8 实现 `src/tools/frame/bh-iframe-type.ts`，默认 risk 为 medium，trace/UI/Agent summary 不写敏感明文。
- [x] 5.9 同步 `src/tools/README.md`，加入 `bh_iframe_read`、`bh_iframe_click`、`bh_iframe_type`，并确认不暴露 `bh_iframe_submit`。

## 6. Policy 与 Approval Runtime Hook

- [x] 6.1 为最小 PolicyEngine 编写测试，覆盖 low/medium 允许、高风险要求 approval、runtime policy 优先于模型参数。
- [x] 6.2 实现 `src/agent/policy/policy-engine.ts`，整合现有 RiskClassifier / ApprovalPolicy 能力，保留高风险执行前阻断。
- [x] 6.3 为 ApprovalDecision schema 编写测试，覆盖 approve、deny、未知 request 和敏感 argsPreview mask。
- [x] 6.4 扩展 approval schema，加入 decision/audit event 所需类型，保持现有 ApprovalRequest 兼容。
- [x] 6.5 为 approval runtime manager/store 编写测试，覆盖创建 pending request、approve、deny、expired 或未知 request。
- [x] 6.6 实现最小 `src/runtime/approval/` 能力，支持 pending request 状态管理和 decision 应用。
- [x] 6.7 更新 AgentLoop / RunController 测试，覆盖 approval_required -> waiting_for_approval、approve 后可恢复、deny 后 `USER_DENIED_APPROVAL` 和 trace 事件。
- [x] 6.8 实现 deny 后返回 `USER_DENIED_APPROVAL` ToolResult 或 run failure，不执行对应动作。

## 7. Side Panel 最小对齐

- [x] 7.1 为 side panel run mode 文案编写渲染测试，覆盖 Ask/Debug/Form/Act 中英文双语展示。
- [x] 7.2 更新当前 side panel mode selector 和 run snapshot/header 文案，展示“动作准备 / Act”但不声称完全自动执行。
- [x] 7.3 为 waiting_for_approval、requiresObserve、USER_DENIED_APPROVAL 的最小状态文案编写测试。
- [x] 7.4 更新 side panel 最小状态展示，复用现有 UI 样式，不新增完整 ApprovalDialog、drawer 或 Cockpit UI。

## 8. 工具 TSDoc/JSDoc 治理

- [x] 8.1 统计所有现有 `src/tools/**/bh-*.ts` 工具文件，并写入本次治理检查清单。
  - 本次检查清单：`bh_a11y_find_interactive`、`bh_a11y_refresh_refs`、`bh_a11y_resolve_ref`、`bh_a11y_snapshot`、`bh_action_check_readiness`、`bh_agent_ask_user`、`bh_agent_fail`、`bh_agent_finish`、`bh_element_inspect`、`bh_element_read_state`、`bh_form_find_disabled_submit_reason`、`bh_form_find_missing_required`、`bh_form_find_validation_errors`、`bh_form_inspect`、`bh_form_list`、`bh_form_read_fields`、`bh_frame_list`、`bh_iframe_click`、`bh_iframe_read`、`bh_iframe_type`、`bh_page_observe`。
- [x] 8.2 为 agent 工具补齐 TSDoc/JSDoc 头部注释：`bh_agent_ask_user`、`bh_agent_fail`、`bh_agent_finish`。
- [x] 8.3 为 a11y 工具补齐 TSDoc/JSDoc 头部注释：`bh_a11y_find_interactive`、`bh_a11y_refresh_refs`、`bh_a11y_resolve_ref`、`bh_a11y_snapshot`。
- [x] 8.4 为 element 工具补齐 TSDoc/JSDoc 头部注释：`bh_element_inspect`、`bh_element_read_state`。
- [x] 8.5 为 form 工具补齐 TSDoc/JSDoc 头部注释：`bh_form_list`、`bh_form_inspect`、`bh_form_read_fields`、`bh_form_find_missing_required`、`bh_form_find_validation_errors`、`bh_form_find_disabled_submit_reason`。
- [x] 8.6 为 page/frame 工具补齐 TSDoc/JSDoc 头部注释：`bh_page_observe`、迁移后的 `bh_frame_list` 和新增 iframe/action 工具。
- [x] 8.7 保留每个 `ToolSpec.title` 前的简短中文维护注释，并确认与头部块注释不冲突。
- [x] 8.8 对照 `src/tools/README.md` 检查所有 `bh_` 工具，确保表格不漏项、不含旧路径。

## 9. Fixtures 与 E2E

- [x] 9.1 新增或更新 iframe fixture，覆盖 iframe 内可读文本、按钮、输入框、敏感字段和 frame 导航/stale 场景。
- [x] 9.2 为 iframe read/click/type 补充 DOM 或 Node 集成测试，证明 frame ref 路由、readiness 和 changedPage/requiresObserve 标记正确。
- [x] 9.3 按三层 POM 补充 extension E2E flow，覆盖 act mode 下 iframe read 和受控 click/type 的核心链路。
- [x] 9.4 E2E 不验证完整 approval UI，只验证 approval_required / waiting_for_approval / deny result 的 runtime 状态和 trace。

## 10. 文档与验收

- [x] 10.1 更新 `docs/roadmap/v0.33-safe-action-readiness.md`，同步 iframe read/click/type prototype、Act mode 双语、tool documentation 治理和 `iframe_submit` non-goal。
- [x] 10.2 更新 `implementation-notes.md`，记录 v0.33 设计决策、偏差说明、权衡分析、验证记录和后续 `iframe_submit` 提醒。
- [x] 10.3 运行 action/frame/approval/tool schema 相关 Vitest。
- [x] 10.4 运行 `npm run typecheck`。
- [x] 10.5 运行 `npm run lint`。
- [x] 10.6 运行 `npm test` 或影响范围内的完整单元/集成测试组合。
- [x] 10.7 运行 `npm run build`。
- [x] 10.8 涉及 content RPC、iframe 或 side panel 行为时运行 `npm run test:e2e`。
- [x] 10.9 运行 `npx openspec validate implement-v0-33-safe-action-readiness --strict`。
