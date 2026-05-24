## ADDED Requirements

### Requirement: Approval Decision 契约

系统 MUST 提供 approval decision 契约，用于表达用户对 pending ApprovalRequest 的批准或拒绝。

#### Scenario: 用户批准审批请求
- **WHEN** runtime 收到针对 pending request 的 approve decision
- **THEN** 系统 MUST 将对应 request 标记为 approved
- **THEN** 系统 MUST 记录 approval approved trace event 或等价 audit event

#### Scenario: 用户拒绝审批请求
- **WHEN** runtime 收到针对 pending request 的 deny decision
- **THEN** 系统 MUST 将对应 request 标记为 denied
- **THEN** 系统 MUST 记录 approval denied trace event 或等价 audit event

#### Scenario: 决策请求不存在
- **WHEN** runtime 收到未知 request id 的 approval decision
- **THEN** 系统 MUST 返回结构化错误
- **THEN** 系统 MUST NOT 改变当前 run 状态

### Requirement: Approval Runtime Hook

系统 MUST 在高风险动作执行前创建 ApprovalRequest，并让 run 进入 `waiting_for_approval`。

#### Scenario: 高风险动作请求审批
- **WHEN** action readiness 或 policy 判断拟执行动作为 high risk
- **THEN** 系统 MUST 创建 ApprovalRequest
- **THEN** run status MUST 进入 `waiting_for_approval`
- **THEN** 动作 MUST NOT 在 approval 前执行

#### Scenario: ApprovalRequest 可供 UI 消费
- **WHEN** 系统创建 ApprovalRequest
- **THEN** request MUST 包含 runId、stepId、tool、argsPreview、risk、reason、status 和 createdAt
- **THEN** 敏感参数 MUST 以 mask preview 进入 argsPreview 或 actionPreview

#### Scenario: Approval required 写入 trace
- **WHEN** 系统创建 ApprovalRequest
- **THEN** trace MUST 记录 approval_required 事件
- **THEN** trace payload MUST 包含可供 v0.4 UI 展示的 request 摘要

### Requirement: Deny 后返回用户拒绝结果

系统 MUST 在用户拒绝 approval 后返回 `USER_DENIED_APPROVAL` ToolResult 或 run failure。

#### Scenario: 用户拒绝后不执行动作
- **WHEN** 用户 deny pending ApprovalRequest
- **THEN** 系统 MUST NOT 执行对应动作
- **THEN** 系统 MUST 返回 code 为 `USER_DENIED_APPROVAL` 的结果

#### Scenario: 用户拒绝后 run 状态
- **WHEN** 用户 deny approval 且当前任务无法继续
- **THEN** run MUST 进入 `failed` 状态或等价终止状态
- **THEN** run summary MUST 明确说明用户拒绝了审批

#### Scenario: 用户拒绝写入 trace
- **WHEN** 用户 deny approval
- **THEN** trace MUST 记录拒绝事件
- **THEN** 模型上下文 MUST 只接收拒绝摘要，不接收完整敏感参数

### Requirement: Approve 后恢复但不扩大动作范围

系统 MUST 支持 approve 后恢复 run，但 v0.33 MUST NOT 因此实现 submit 或完整动作体系。

#### Scenario: 用户批准后恢复
- **WHEN** 用户 approve pending ApprovalRequest
- **THEN** runtime MAY 将 run 从 `waiting_for_approval` 恢复为可继续状态
- **THEN** 系统 MUST 记录 approval approved 事件

#### Scenario: 批准不代表 submit 可用
- **WHEN** 用户 approve 某个 v0.33 iframe click 或 type 请求
- **THEN** 系统 MAY 继续该受控 iframe action
- **THEN** 系统 MUST NOT 暴露或执行 `iframe_submit`

### Requirement: PolicyEngine 最小入口

系统 MUST 提供最小 PolicyEngine，用于统一风险、readiness 和 approval 判断。

#### Scenario: 中低风险动作
- **WHEN** action readiness 返回 low 或 medium risk 且 policy 不要求 approval
- **THEN** PolicyEngine MUST 允许受控动作继续执行

#### Scenario: 高风险动作
- **WHEN** action readiness 或 tool risk 为 high
- **THEN** PolicyEngine MUST 要求 approval
- **THEN** 动作 MUST NOT 绕过 approval hook

#### Scenario: Runtime 判断优先
- **WHEN** 模型输出与 runtime policy 判断不一致
- **THEN** runtime policy MUST 优先生效
- **THEN** 模型 MUST NOT 通过参数声明绕过 approval
