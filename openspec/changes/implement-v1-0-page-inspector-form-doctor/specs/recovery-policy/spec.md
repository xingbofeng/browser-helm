## ADDED Requirements

### Requirement: RecoveryPolicy 错误映射
系统 MUST 提供 RecoveryPolicy，将可恢复错误码映射到恢复动作，并把恢复状态写入 run trace。

#### Scenario: REF_STALE 触发 re-observe
- **WHEN** 工具返回 REF_STALE 或 PAGE_CHANGED
- **THEN** RecoveryPolicy MUST 选择 re_observe 恢复动作
- **THEN** run status MUST 能进入 recovering 或等价状态

#### Scenario: 参数或模型输出错误触发修复
- **WHEN** 工具返回 TOOL_ARGS_INVALID 或模型输出解析失败
- **THEN** RecoveryPolicy MUST 选择 repair_tool_args、parser recovery 或 fail
- **THEN** trace MUST 记录恢复原因

### Requirement: RecoveryBudget
系统 MUST 限制自动恢复次数，避免同一 run 进入无限恢复循环。

#### Scenario: 恢复预算耗尽
- **WHEN** 同类错误在同一 run 中超过恢复预算
- **THEN** 系统 MUST 进入 waiting_for_user 或 failed
- **THEN** DebugReport 或 run summary MUST 说明已尝试的恢复动作
