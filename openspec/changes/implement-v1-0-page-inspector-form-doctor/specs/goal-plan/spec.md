## ADDED Requirements

### Requirement: Goal 与 SuccessCriteria
系统 MUST 在 v1.0 使用 Goal / SuccessCriteria 参与 Debug/Form run 的完成判断。

#### Scenario: 用户提供完成条件
- **WHEN** AgentRunInput 包含 goal 或 successCriteria
- **THEN** run metadata 和 trace MUST 保留这些字段
- **THEN** finish 判断 MUST 引用满足或未满足的 criteria

#### Scenario: 系统派生默认完成条件
- **WHEN** 用户未提供 successCriteria
- **THEN** 系统 MUST 根据 task classification 和 mode template 派生默认 criteria
- **THEN** 派生结果 MUST 可在 trace 或 DebugReport 中解释

### Requirement: Mode-based lightweight plan
系统 MUST 生成 mode-based lightweight plan，作为 v1.0 run 的路线图。

#### Scenario: PlanState 进入 trace
- **WHEN** 系统生成或更新 plan
- **THEN** 完整 PlanState MUST 写入 trace 或 storage
- **THEN** 模型上下文 MUST 只接收 PlanProgressSummary

#### Scenario: Plan 可动态调整
- **WHEN** 页面无表单、权限不足、ref stale、用户 interrupt 或 revise goal
- **THEN** 系统 MUST 能更新 plan step 状态或插入恢复步骤
- **THEN** plan update MUST 写入 trace
