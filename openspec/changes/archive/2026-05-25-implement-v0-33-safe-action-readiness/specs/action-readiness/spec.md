## ADDED Requirements

### Requirement: 动作意图契约

系统 MUST 提供 `ActionIntent` 契约，用于表达一次拟执行浏览器动作的类型、目标 ref、可选输入预览和来源。

#### Scenario: 表达点击动作意图
- **WHEN** Agent 或 runtime 准备检查点击动作
- **THEN** action intent MUST 包含 action kind `click`
- **THEN** action intent MUST 包含目标 `refId`

#### Scenario: 表达输入动作意图
- **WHEN** Agent 或 runtime 准备检查输入动作
- **THEN** action intent MUST 包含 action kind `type`
- **THEN** action intent MUST 包含目标 `refId`
- **THEN** action intent MUST 使用安全预览表达输入值，敏感值 MUST 被 mask

#### Scenario: 支持后续动作类型枚举
- **WHEN** 系统解析 action intent
- **THEN** action kind MUST 支持 `click`、`type`、`select`、`submit` 和 `focus`
- **THEN** v0.33 MUST NOT 因支持枚举而实际执行 `submit`

### Requirement: 动作准备状态契约

系统 MUST 提供 `ActionReadiness` 契约，用于表达拟执行动作是否具备进入准备执行、等待审批、需要重新观察或不可执行状态的条件。

#### Scenario: 动作准备通过
- **WHEN** 目标 ref 有效、页面未明确变化、目标元素可见且动作与目标匹配
- **THEN** readiness MUST 返回 `canAct=true`
- **THEN** readiness MUST 返回风险等级、原因、`requiresObserve=false` 和可选 next hints

#### Scenario: Ref stale
- **WHEN** 目标 ref 已失效或无法解析到当前 DOM node
- **THEN** readiness MUST 返回 `canAct=false`
- **THEN** readiness MUST 标记 `staleRefs=true` 和 `requiresObserve=true`
- **THEN** readiness MUST 使用结构化 code 表达 `REF_STALE` 或等价 ref 失效原因

#### Scenario: 页面变化要求重新观察
- **WHEN** URL、origin、frame URL、frame id 可达性或 observation token 明确变化
- **THEN** readiness MUST 返回 `canAct=false`
- **THEN** readiness MUST 标记 `changedPage=true` 和 `requiresObserve=true`

#### Scenario: 元素不可操作
- **WHEN** 目标元素隐藏、禁用、不可见或动作类型与元素语义不匹配
- **THEN** readiness MUST 返回 `canAct=false`
- **THEN** readiness MUST 给出可读 reason 和结构化 code
- **THEN** readiness MUST NOT 尝试执行动作

### Requirement: 动作风险与审批预判

系统 MUST 在 action readiness 中返回动作风险和是否可能需要 approval 的预判。

#### Scenario: 普通点击风险
- **WHEN** action kind 为 `click` 且目标没有 submit、send、delete、payment、upload 等敏感语义
- **THEN** readiness MUST 返回 `low` 或 `medium` 风险
- **THEN** readiness MAY 返回 `wouldRequireApproval=false`

#### Scenario: 敏感动作升级高风险
- **WHEN** action kind 或目标语义表达 submit、send、delete、payment、upload、clipboard、execute_js、password、token、otp 或 API key
- **THEN** readiness MUST 返回 `high` 风险或标记 `wouldRequireApproval=true`
- **THEN** readiness MUST NOT 因准备状态通过而直接执行动作

#### Scenario: 结构化敏感字段信号
- **WHEN** 目标 ref 解析结果包含 `inputType=password`、敏感 `autocomplete` 或 `isSensitive=true`
- **THEN** readiness MUST 将该目标视为敏感目标
- **THEN** readiness MUST 不只依赖 accessible name 或 label 正则判断敏感性

#### Scenario: Readiness 工具不触发审批请求
- **WHEN** Agent 调用 `bh_action_check_readiness`
- **THEN** 工具 MUST 只返回 readiness 结果
- **THEN** 工具 MUST NOT 创建 ApprovalRequest
- **THEN** 工具 MUST NOT 进入 `waiting_for_approval`

### Requirement: `bh_action_check_readiness` 工具

系统 MUST 提供模型可见的只读 `bh_action_check_readiness` 工具，用于检查拟执行动作是否具备安全准备条件。

#### Scenario: 检查可执行动作
- **WHEN** Agent 调用 `bh_action_check_readiness` 并传入有效 action intent
- **THEN** 工具 MUST 返回 ActionReadiness payload
- **THEN** ToolResult MUST 标记 `changedPage=false`
- **THEN** ToolResult MUST NOT 修改页面状态

#### Scenario: 检查需要重新观察的动作
- **WHEN** readiness 判断目标 ref 或页面状态过期
- **THEN** 工具 MUST 返回 `requiresObserve=true`
- **THEN** 工具 summary MUST 提示重新 observe 或 refresh refs

#### Scenario: 工具模式
- **WHEN** 注册 `bh_action_check_readiness`
- **THEN** 工具 modes MUST 包含 `act` 和 `debug`
- **THEN** 工具 risk MUST 为 `low`

### Requirement: 动作结果标记

系统 MUST 统一使用 ToolResult 标记动作结果对页面和后续观察的影响。

#### Scenario: 只读 readiness 结果
- **WHEN** readiness 工具成功返回
- **THEN** ToolResult MUST 标记 `changedPage=false`
- **THEN** ToolResult MUST 按 readiness 判断设置 `requiresObserve`

#### Scenario: 动作原型修改页面
- **WHEN** v0.33 受控 iframe click 或 type 成功执行
- **THEN** ToolResult MUST 标记 `changedPage=true`
- **THEN** ToolResult MUST 标记 `requiresObserve=true`
- **THEN** summary MUST 提醒后续重新 observe 当前页面或目标 frame
