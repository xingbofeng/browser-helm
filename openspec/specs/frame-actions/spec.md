# Frame Actions Specification

## Purpose

定义 BrowserHelm frame/iframe 工具边界、复合 ref、受控 iframe read/click/type 原型和 submit 后置范围。

## Requirements

### Requirement: Frame 工具边界

系统 MUST 将 frame/iframe 相关工具归入 frame 工具边界，并保持现有 frame list 行为兼容。

#### Scenario: frame list 工具迁移
- **WHEN** 注册 `bh_frame_list`
- **THEN** 工具实现文件 SHOULD 位于 `src/tools/frame/`
- **THEN** 工具名、参数、返回语义 MUST 与迁移前保持兼容

#### Scenario: frame 工具 mode
- **WHEN** 注册 frame/iframe 工具
- **THEN** 只读 frame 工具 modes MUST 包含 `debug` 和 `act`
- **THEN** 会修改页面状态的 iframe 工具 modes MUST 包含 `act`

### Requirement: 复合 iframe ref

系统 MUST 支持以 `frame_<id>:ref_<id>` 复合 refId 引用 iframe 内目标元素。

#### Scenario: 使用复合 refId
- **WHEN** iframe 工具收到 `frame_<id>:ref_<id>` 形式的 refId
- **THEN** 系统 MUST 从 refId 中解析目标 frame id 和 frame 内 ref id
- **THEN** 系统 MUST 将请求路由到对应 frame

#### Scenario: 可选 frameId 一致性校验
- **WHEN** iframe 工具同时收到复合 refId 和显式 frameId
- **THEN** 系统 MUST 校验二者指向同一 frame
- **THEN** 如果二者不一致，系统 MUST 返回结构化错误并且不执行动作

#### Scenario: frame 不可达
- **WHEN** 目标 frame 已导航、重载、消失或 content script 不可达
- **THEN** iframe 工具 MUST 返回结构化错误
- **THEN** ToolResult MUST 标记 `requiresObserve=true`

### Requirement: `bh_iframe_read` 工具

系统 MUST 提供只读 `bh_iframe_read` 工具，用于读取 iframe 内目标 ref 或 frame 摘要。

#### Scenario: 读取 iframe 目标
- **WHEN** Agent 调用 `bh_iframe_read` 并传入有效 iframe ref
- **THEN** 工具 MUST 返回目标元素的 role、name、tagName、visible、disabled 和 frame 摘要
- **THEN** 工具 MUST NOT 修改页面状态

#### Scenario: 读取 iframe 失败
- **WHEN** 目标 frame 或 ref 不可达
- **THEN** 工具 MUST 返回结构化错误
- **THEN** 工具 MUST 提供重新 observe 或刷新 refs 的 next hint

#### Scenario: iframe read 风险
- **WHEN** 注册 `bh_iframe_read`
- **THEN** 工具 risk MUST 为 `low`
- **THEN** 工具 MUST NOT 触发 approval

### Requirement: `bh_iframe_click` 工具

系统 MUST 提供受控 `bh_iframe_click` 工具，用于点击 iframe 内目标元素，并强制执行 readiness 和 policy 检查。

#### Scenario: 点击前强制 readiness
- **WHEN** Agent 调用 `bh_iframe_click`
- **THEN** 工具 MUST 在点击前调用 action readiness
- **THEN** readiness 未通过时工具 MUST NOT 点击页面

#### Scenario: 点击前强制 policy
- **WHEN** readiness 判断点击目标为高风险或需要 approval
- **THEN** 工具 MUST 返回 approval required 结果或交由 runtime 进入 approval flow
- **THEN** 工具 MUST NOT 在用户批准前点击页面

#### Scenario: 点击成功
- **WHEN** iframe click 通过 readiness 和 policy 并成功执行
- **THEN** ToolResult MUST 返回成功摘要
- **THEN** ToolResult MUST 标记 `changedPage=true` 和 `requiresObserve=true`

#### Scenario: iframe click 风险
- **WHEN** 注册 `bh_iframe_click`
- **THEN** 工具默认 risk MUST 为 `medium`
- **THEN** 工具 MUST 能按目标语义升级为 high-risk approval flow

### Requirement: `bh_iframe_type` 工具

系统 MUST 提供受控 `bh_iframe_type` 工具，用于向 iframe 内目标输入文本，并强制执行 readiness、policy 和敏感值保护。

#### Scenario: 输入前强制 readiness
- **WHEN** Agent 调用 `bh_iframe_type`
- **THEN** 工具 MUST 在输入前调用 action readiness
- **THEN** readiness 未通过时工具 MUST NOT 输入文本

#### Scenario: 敏感输入 mask
- **WHEN** 输入目标或输入语义包含 password、token、secret、otp、API key 或其他敏感字段
- **THEN** ToolResult、trace、UI 和 Agent summary MUST NOT 包含输入明文
- **THEN** 工具 MUST 使用 mask preview 表达输入值

#### Scenario: 输入成功
- **WHEN** iframe type 通过 readiness 和 policy 并成功执行
- **THEN** ToolResult MUST 返回成功摘要
- **THEN** ToolResult MUST 标记 `changedPage=true` 和 `requiresObserve=true`

#### Scenario: iframe type 风险
- **WHEN** 注册 `bh_iframe_type`
- **THEN** 工具默认 risk MUST 为 `medium`
- **THEN** 工具 MUST 能按目标语义或输入内容升级为 high-risk approval flow

### Requirement: iframe mutating RPC 授权边界

系统 MUST 将会修改页面状态的 iframe content RPC 视为受保护 primitive。

#### Scenario: 裸 content RPC 不可修改 iframe
- **WHEN** content script 收到未携带 runtime action token 的 iframe click 或 type RPC
- **THEN** content handler MUST 返回 `IFRAME_ACTION_UNAUTHORIZED` 或等价结构化错误
- **THEN** content handler MUST NOT 点击元素或写入文本

#### Scenario: 工具/runtime 授权后才能修改 iframe
- **WHEN** `bh_iframe_click` 或 `bh_iframe_type` 通过 ToolRouter、readiness 和 policy 后调用 content RPC
- **THEN** 请求 MUST 携带 runtime action token
- **THEN** content handler MAY 执行对应 iframe mutation

### Requirement: iframe submit 后置

系统 MUST 明确 v0.33 不实现 iframe submit 或 submit-with-approval。

#### Scenario: submit 工具不可用
- **WHEN** Agent 在 v0.33 请求 iframe submit 能力
- **THEN** prompt tool surface MUST NOT 暴露 `bh_iframe_submit`
- **THEN** 文档和任务记录 MUST 提醒后续版本单独确认 submit 前 verify、字段摘要和 approval UI 边界
