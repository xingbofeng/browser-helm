# agent-findings Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: AgentFinding 证据契约
系统 MUST 使用 AgentFinding 表达 Debug/Form 诊断结论，并为每个结论提供 evidence 和 confidence。

#### Scenario: Debug/Form 结论必须有证据
- **WHEN** 系统输出 Debug 或 Form 诊断结论
- **THEN** 每个 AgentFinding MUST 包含 title、explanation、evidence 和 confidence
- **THEN** evidence MUST 指向 observation、form、debug、tool_result 或 user source

#### Scenario: 无证据结论降级
- **WHEN** 系统无法为某个判断找到 evidence
- **THEN** 系统 MUST 将该判断放入 limitations 或使用 low confidence
- **THEN** 系统 MUST NOT 将无证据推断表现为确定事实

### Requirement: Confidence 规则
系统 MUST 根据证据强度设置 confidence。

#### Scenario: 直接证据可高置信
- **WHEN** finding 由直接页面、表单、debug signal 或 tool result 支撑
- **THEN** confidence MAY 为 high

#### Scenario: 推断性原因不得高置信
- **WHEN** finding 只由关联信号推断得出
- **THEN** confidence MUST 为 low 或 medium

