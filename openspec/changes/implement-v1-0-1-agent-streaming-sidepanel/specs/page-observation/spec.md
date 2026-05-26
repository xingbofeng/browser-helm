## ADDED Requirements

### Requirement: 自动页面观察
v1.0.1 side panel MUST automatically start a readonly page observation run when opened for a target tab.

#### Scenario: 打开 side panel 自动观察
- **WHEN** 用户打开 BrowserHelm side panel 且存在 target tab
- **THEN** UI SHOULD 通过 RuntimePort 发起 `观察当前页面` 或等价 readonly run
- **THEN** 自动 run MUST NOT 执行 mutating tools 或 high-risk actions

#### Scenario: 页面摘要进入 AgentMessage
- **WHEN** 自动观察成功
- **THEN** RunSnapshot.messages MUST 包含页面摘要 message 或等价产品化摘要
- **THEN** 默认 UI MUST 能展示页面标题、域名、可见文本摘要、页面状态和 warnings 的用户可读摘要

#### Scenario: 恢复已有观察
- **WHEN** side panel 刷新或重新打开且已有可用 snapshot
- **THEN** UI SHOULD 优先恢复已有 messages/snapshot
- **THEN** UI SHOULD NOT 无限制创建重复自动观察 run
