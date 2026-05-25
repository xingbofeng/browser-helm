## ADDED Requirements

### Requirement: Cockpit 承载 v1.0 诊断流程
Cockpit UI MUST 在现有 v0.4 shell 中承载 v1.0 Page Inspector + Form Doctor 的最小诊断体验。

#### Scenario: 展示 classification 与 plan
- **WHEN** run snapshot 包含 task classification、mode reason 或 plan progress
- **THEN** Cockpit UI MUST 展示当前 mode reason
- **THEN** Cockpit UI MUST 展示 plan progress summary

#### Scenario: 展示 findings 与 report
- **WHEN** run snapshot 或 trace 包含 AgentFinding 或 DebugReport
- **THEN** Cockpit UI MUST 展示 findings、evidence、confidence、recommendations 和 limitations
- **THEN** UI MUST NOT 要求新增 FormPanel、DebugPanel 或 TraceViewer detail

### Requirement: Cockpit 支持 interrupt / revise goal
Cockpit UI MUST 支持 v1.0 用户中断 run、转只读诊断或修改 goal 的最小入口。

#### Scenario: 用户修改目标
- **WHEN** 用户在 run 中选择 revise goal 或要求只读诊断
- **THEN** UI MUST 通过 RuntimePort 发送结构化 request
- **THEN** runtime MUST 将该事件写入 trace
