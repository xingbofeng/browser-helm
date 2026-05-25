## ADDED Requirements

### Requirement: Run Mode Gate 与 Mode System 分层
Run Mode Gate MUST 继续作为执行前最小门禁；v1.0 Mode System MUST 在其上层处理 task classification、dynamic tool selection 和 prompt/context policy。

#### Scenario: Mode System 使用 Run Mode Gate
- **WHEN** Mode System 为 run 选择 mode 并生成工具列表
- **THEN** Run Mode Gate MUST 继续阻止当前 mode 不允许的工具执行
- **THEN** ToolSelector MUST NOT 替代 Run Mode Gate 的执行前校验

#### Scenario: 显式 mode 保持兼容
- **WHEN** AgentRunInput 显式提供 ask、debug、form 或 act mode
- **THEN** v1.0 Mode System MUST 保持该输入兼容
- **THEN** TaskClassifier MAY 为该 mode 补充 reason 和 confidence
