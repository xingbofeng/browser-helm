## ADDED Requirements

### Requirement: Cockpit Run Mode 展示
Cockpit UI MUST 在任务输入和 run 状态区域展示当前 Run Mode 的中英文双语名称。

#### Scenario: 用户选择 Run Mode
- **WHEN** 用户在 Cockpit UI 选择 Ask、Debug、Form 或 Act mode 并发起 run
- **THEN** UI MUST 将对应 mode 写入 RuntimePort.startRun input
- **THEN** timeline 或 run header MUST 展示该 mode 的中英文双语名称

#### Scenario: Act mode 文案边界
- **WHEN** Cockpit UI 展示“动作准备 / Act”
- **THEN** UI MUST 表达该模式用于动作前检查和受控动作
- **THEN** UI MUST NOT 将 Act mode 描述为完全自动执行模式

