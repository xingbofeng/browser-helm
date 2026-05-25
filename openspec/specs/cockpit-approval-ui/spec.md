# Cockpit Approval UI Specification

## Purpose

定义 v0.4 Cockpit UI 的基础 approval drawer、Approve / Deny 交互、approval event 展示和敏感参数遮蔽要求。

## Requirements

### Requirement: Approval Drawer
Cockpit UI MUST 使用 drawer 或等价侧边栏内审批面板展示 pending ApprovalRequest。

#### Scenario: 展示 pending approval
- **WHEN** run snapshot 包含 pending ApprovalRequest 或状态为 `waiting_for_approval`
- **THEN** Cockpit UI MUST 展示 approval drawer
- **THEN** drawer MUST 展示 tool、risk、reason、action preview 和 args preview

#### Scenario: Approval 不使用完整页面动作扩展
- **WHEN** Cockpit UI 展示 approval drawer
- **THEN** UI MUST NOT 暗示 v0.4 已支持 submit-with-approval、`iframe_submit` 或完整普通页面动作执行器

### Requirement: Approval 决策交互
Approval UI MUST 支持用户批准或拒绝 pending request。

#### Scenario: 用户批准 request
- **WHEN** 用户点击 Approve
- **THEN** UI MUST 通过 RuntimePort 或 runtime message 发送 approved decision
- **THEN** timeline MUST 展示 approval approved 事件或等价状态

#### Scenario: 用户拒绝 request
- **WHEN** 用户点击 Deny
- **THEN** UI MUST 通过 RuntimePort 或 runtime message 发送 denied decision
- **THEN** timeline MUST 展示 approval denied 事件或 `USER_DENIED_APPROVAL` 结果

#### Scenario: 未知 request 决策失败
- **WHEN** runtime 返回未知 request 或 decision 失败错误
- **THEN** Approval UI MUST 展示结构化错误
- **THEN** UI MUST NOT 假装审批已成功

### Requirement: Approval 敏感数据遮蔽
Approval UI MUST 遮蔽敏感参数和敏感输入预览。

#### Scenario: 敏感 args preview
- **WHEN** ApprovalRequest args preview 包含 password、token、api key、otp 或等价敏感语义
- **THEN** Approval UI MUST 显示 masked preview
- **THEN** 明文敏感值 MUST NOT 出现在 drawer、timeline 或 inspector

#### Scenario: Approval trace 展示
- **WHEN** timeline 或 ToolInspector 展示 approval event
- **THEN** UI MUST 展示 request 摘要、risk 和 reason
- **THEN** UI MUST NOT 展示完整敏感参数
