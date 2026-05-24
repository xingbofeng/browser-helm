## ADDED Requirements

### Requirement: 用户可见 Run Cancellation
系统 MUST 支持 Cockpit UI 发起用户可见的 run cancellation。

#### Scenario: Stop 取消当前 run
- **WHEN** 用户在 Cockpit UI 点击 Stop
- **THEN** runtime MUST 接收 cancelRun 或等价 runtime request
- **THEN** 对应 run MUST 进入 `cancelled` 或等价终止状态
- **THEN** 系统 MUST NOT 继续执行后续工具

#### Scenario: Cancellation 写入 trace
- **WHEN** runtime 取消 run
- **THEN** trace MUST 记录 run cancelled 或等价 terminal event
- **THEN** Cockpit UI MUST 能在 timeline 中展示取消结果

