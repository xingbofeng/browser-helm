## ADDED Requirements

### Requirement: v1.0 正式 Approval Runtime
Approval runtime hook MUST 在 v1.0 成为正式 HITL / Policy / Approval Runtime，覆盖执行前 policy guard、request lifecycle 和 audit trace。

#### Scenario: 执行前 policy guard
- **WHEN** 任意工具即将执行
- **THEN** runtime MUST 在执行前评估 tool risk、readiness、capability 和 policy
- **THEN** high-risk 动作 MUST 在执行前进入 approval flow 或被拒绝

#### Scenario: Approval lifecycle 写入 audit
- **WHEN** approval request 被创建、批准、拒绝或找不到
- **THEN** runtime MUST 记录结构化 audit trace event
- **THEN** RunSnapshot MUST 能让 Cockpit UI 展示 pending request 或 decision result

### Requirement: v1.0 Approve 不自动执行 v1.1 动作
v1.0 approval approve MUST 不自动执行填写、verify、submit-with-approval 或提交执行器。

#### Scenario: Approve 仅记录决策
- **WHEN** 用户在 v1.0 Cockpit 中 approve pending request
- **THEN** runtime MUST 记录 approved decision
- **THEN** runtime MUST NOT 因 approve 自动执行 v1.1 的 fill、verify 或 submit 动作
