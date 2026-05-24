## Context

BrowserHelm 当前已经具备 v0.2 页面观察与 stable ref、v0.31 交互元素识别、v0.32 表单字段诊断和最小 Run Mode Gate。AgentLoop 也已有高风险工具执行前的 approval_required 阻断雏形：当工具 risk 为 high 时，可以生成 `APPROVAL_REQUIRED` ToolResult 并进入 `waiting_for_approval`。

缺口在于：系统还没有统一的动作前安全检查层。后续 click/type/submit 如果直接依赖工具自身判断，会让 ref freshness、页面变化、元素状态、风险分级、approval hook 和 trace 标记分散在各个工具里。真实网页还大量使用 iframe，BrowserHelm 已经能 all-frames 观察并返回 `frame_<id>:ref_<id>` 复合 ref，但缺少 frame/iframe 工具边界来复用这些数据。

v0.33 因此把重点放在“动作准备状态 / Action Readiness”与受控 iframe action prototype：它允许先实现 iframe read/click/type 作为安全层试验场，但不放开完整页面动作系统，也不做 iframe submit。

## Goals / Non-Goals

**Goals:**

- 建立可复用的 `ActionIntent` / `ActionReadiness` / `ActionResult` 契约。
- 新增 `动作准备 / Act` run mode，并用中英文双语展示所有 mode、动作类型和风险等级。
- 新增 `bh_action_check_readiness`，让 Agent 可以显式检查拟执行动作的准备状态。
- 为 iframe 场景新增 `bh_iframe_read`、`bh_iframe_click`、`bh_iframe_type`，并要求 click/type 内部强制通过 readiness 和 policy。
- 将 `bh_frame_list` 迁移到 `src/tools/frame/`，保持工具名与行为兼容。
- 建立最小 `PolicyEngine` / approval runtime hook：高风险动作生成 ApprovalRequest，deny 返回 `USER_DENIED_APPROVAL`。
- 确保 iframe click/type 修改页面后返回 `changedPage=true` 和 `requiresObserve=true`。
- 一次性补齐所有现有 `src/tools/**/bh-*.ts` 的 TSDoc/JSDoc 头部注释，并同步检查 `src/tools/README.md`。

**Non-Goals:**

- 不实现 `iframe_submit`。
- 不实现完整普通页面 click/type/nav 工具体系。
- 不实现自动填表或 submit-with-approval。
- 不实现完整 ApprovalDialog、drawer 或 Cockpit UI；v0.33 只做现有 UI 的最小双语文案对齐。
- 不实现 workflow replay、memory、sub-agent 或视觉坐标动作。

## Decisions

### 1. Action Readiness 作为纯能力 + 工具包装

选择实现可复用的纯函数/服务，例如 `checkActionReadiness(...)`，并在 `bh_action_check_readiness` 工具中包装它。iframe click/type 也必须调用同一 readiness 能力，而不是各自复制判断逻辑。

备选方案是只做模型可见工具，让 Agent 自己在动作前调用。放弃该方案，因为安全层不能只依赖模型自觉；mutating tool 必须由 runtime/tool 自己强制检查。

### 2. v0.33 引入 Act mode，但 Act 不等于完全自动执行

`act` mode 用中文展示为 `动作准备 / Act`。它允许 action readiness、frame read/click/type prototype 和 approval hook 出现在工具面，但不代表所有动作工具都可用。

备选方案是继续复用 `debug` 或 `form` mode。放弃该方案，因为动作准备和只读诊断语义不同，混在 debug/form 中会让工具可见性边界继续变模糊。

### 3. iframe click/type 作为受控 prototype 纳入 v0.33

原 roadmap 的 v0.33 不做真实 click/type。本次调整允许 iframe click/type，是因为 iframe 是当前真实网页的核心结构，且项目已有 all-frames observation、复合 refId 和 frame list 基础。v0.33 用 iframe action prototype 验证 readiness/policy 的强制链路，而不是一次性扩展普通页面所有动作工具。

备选方案是只做 iframe_read，把 click/type 全部后置。放弃该方案，因为用户希望参考 WebBrain 的 iframe 工具能力，且 click/type 能更早暴露 readiness、approval、changedPage/requiresObserve 的真实集成问题。

### 4. frame 工具统一放入 `src/tools/frame/`

`bh_frame_list` 从 `src/tools/page/` 迁移到 `src/tools/frame/`，工具名不变。新增 `bh_iframe_read`、`bh_iframe_click`、`bh_iframe_type` 也放在同一目录。

备选方案是继续把 frame list 留在 page 目录，只新增 iframe 工具到 frame 目录。放弃该方案，因为目录语义会分裂；v0.33 正好建立 frame 工具边界。

### 5. 复合 refId 是主路径，frameId 是可选校验

iframe 工具主路径使用 `frame_<id>:ref_<id>` 复合 refId。参数可以接受可选 `frameId`，用于调试和一致性校验；当 `frameId` 与复合 refId 不一致时返回结构化错误。

备选方案是要求调用方始终传 `frameId + refId`。放弃该方案，因为当前 observation/ref summary 已经将 iframe ref 表达为复合 refId，继续让模型只持有一个 ref 更简单。

### 6. page change detector 保守实现

v0.33 只做保守页面变化判断：URL、origin、title、frame id 可达性、frame URL 或 observation token/version 明确变化时，返回 `requiresObserve=true`。不做复杂 DOM diff。

备选方案是做完整 DOM/hash diff。放弃该方案，因为 v0.33 目标是安全契约而非页面变化算法；过度敏感的 detector 会让工具频繁阻断。

### 7. 风险分级由 runtime/policy 兜底，不依赖模型自报

`bh_action_check_readiness` 可以返回 `wouldRequireApproval=true`，但真正执行 iframe click/type 时仍必须通过 runtime/tool 内部 policy。敏感语义如 submit/send/delete/payment/password/token/otp 等必须升级为 high 或触发 approval。

备选方案是参考 BrowserBee，将 `requires_approval` 交给模型或 tool call 字段。放弃该方案，因为 BrowserHelm 的安全边界应由 runtime 判断，不能只信模型输出。

### 8. v0.33 只做 approval 数据与生命周期，不做完整 UI

v0.33 需要支持 ApprovalRequest、ApprovalDecision、approval trace event、`waiting_for_approval` 和 deny 后 `USER_DENIED_APPROVAL`。approve 后可以让 session 恢复，但不要求立即执行后续真实 submit。完整 approval UI 放到 v0.4。

备选方案是在本期实现 ApprovalDialog。放弃该方案，因为 v0.4 已专门承接 Cockpit UI 和 Approval UI；本期只需保证数据能被 UI 消费。

### 9. 工具 TSDoc/JSDoc 作为强制维护标准

所有现有和新增 `bh_` 工具都需要头部 TSDoc/JSDoc 块注释。注释内容包括用途、run mode、只读/变更页面、风险、approval、参数、返回语义和典型使用时机。保留 `ToolSpec.title` 前的中文短注释，用于快速扫读。

备选方案是只给新增工具补注释。放弃该方案，因为 v0.33 会新增 action/frame 工具，工具数量继续增长；若不一次性补齐历史工具，维护标准会变成双轨。

## Risks / Trade-offs

- iframe click/type 把 v0.33 范围从“纯检查层”扩大到“受控动作原型” → 通过 non-goal 明确不做 `iframe_submit`、完整页面动作体系和自动填表，并要求 click/type 必须走 readiness/policy。
- frameId 会随导航或重载变化 → 复合 refId 解析失败时返回 `REF_STALE`、`FRAME_NOT_FOUND` 或 `requiresObserve=true`，不猜测替代 frame。
- approval hook 可能和现有 AgentLoop 高风险阻断重复 → 将现有 ApprovalPolicy 演进为最小 PolicyEngine，保持一个统一入口。
- Act mode 可能被误解为“完全自动执行” → UI 和文档必须使用 `动作准备 / Act`，并说明它是动作前检查与受控动作模式。
- iframe type 可能泄露敏感输入 → 对 password/token/otp/API key 等敏感语义必须 mask，trace/UI/Agent summary 不保存明文。
- 所有老工具补注释会增加本期工作量 → 将其作为独立任务批次处理，要求 lint/typecheck 后检查工具 README 与工具文件一致。

## Migration Plan

1. 先新增/扩展 shared schema 和 run mode，保证类型层能表达 action readiness、approval decision 和 `act`。
2. 再实现 page/dom readiness 与 frame resolution 基础能力，保证只读检查可测试。
3. 迁移 `bh_frame_list` 到 `src/tools/frame/`，保持导出和工具名兼容。
4. 新增 action/frame 工具，并接入 readiness/policy。
5. 补齐 approval runtime hook 和 trace 行为。
6. 补齐所有现有工具 TSDoc/JSDoc 注释与 README。
7. 最后运行 typecheck、lint、相关 Vitest、build 和涉及 iframe/action 的 E2E。

如实现中发现 iframe click/type 需要额外权限或浏览器宿主限制，优先保留 read/readiness 和 approval 契约，将 click/type 标记为环境阻塞，不扩大到 submit 或坐标动作。

## Open Questions

- v0.4 是否将 ApprovalDialog 设计为 modal、drawer，还是嵌入 timeline inspector。
- 后续 `iframe_submit` 是否作为独立 tool，还是统一进入 `bh_form_submit_with_approval`。
- 后续普通页面 `bh_element_click` / `bh_element_type` 是否复用与 iframe action 完全一致的 action intent schema。
