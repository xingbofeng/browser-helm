## ADDED Requirements

### Requirement: Cockpit UI 消费 ApprovalRequest
Approval runtime hook MUST 提供 Cockpit UI 可消费的 pending approval snapshot 或 event。

#### Scenario: Pending request 进入 run snapshot
- **WHEN** runtime 创建 ApprovalRequest 并让 run 进入 `waiting_for_approval`
- **THEN** RunSnapshot MUST 包含 pendingApproval 或等价字段
- **THEN** pending approval 数据 MUST 足以让 UI 展示 tool、risk、reason、action preview 和 args preview

#### Scenario: Approval event 进入 timeline
- **WHEN** runtime 记录 approval_required、approval_approved 或 approval_denied event
- **THEN** RunSnapshot trace 或 RuntimeEvent stream MUST 让 Cockpit UI 能展示这些事件

### Requirement: Cockpit Approval 不扩大动作范围
v0.4 Approval UI MUST NOT 改变 v0.33 的动作能力边界。

#### Scenario: Approve 不新增 submit
- **WHEN** 用户在 Cockpit UI 中批准 pending request
- **THEN** runtime MAY 按既有 approval hook 恢复 run
- **THEN** 系统 MUST NOT 因 v0.4 UI 新增 `iframe_submit`、submit-with-approval 或完整普通页面 action executor

