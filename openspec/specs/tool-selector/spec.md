# tool-selector Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: 动态 ToolSelector
系统 MUST 提供 ToolSelector，根据 mode、task classification、page state、runtime capability、permission state、tool risk 和 policy 动态裁剪模型可见工具。

#### Scenario: 按 mode 裁剪工具
- **WHEN** 当前 run mode 为 Ask、Debug、Form 或 Act
- **THEN** ToolSelector MUST 只返回该 mode、当前 task 和当前 state 需要的工具
- **THEN** ToolSelector MUST NOT 暴露无关 mode 的专用工具

#### Scenario: 按 capability 裁剪工具
- **WHEN** 某个工具需要当前 runtime 不具备的 capability 或 permission
- **THEN** ToolSelector MUST 从模型可见工具中移除该工具
- **THEN** DebugReport 或 timeline MUST 能说明该能力不可用的 limitation

### Requirement: Deny-by-default 工具选择
ToolSelector MUST 使用 deny-by-default 策略，除非工具被 mode、task、state、permission 和 risk 同时允许。

#### Scenario: 高风险工具默认隐藏
- **WHEN** 工具 risk 为 high 且当前 task/mode/policy 未明确允许进入 approval boundary
- **THEN** ToolSelector MUST NOT 向模型暴露该工具

#### Scenario: Selector 不是唯一安全边界
- **WHEN** 模型或 UI 仍尝试调用未被 ToolSelector 暴露的工具
- **THEN** ToolRouter 或 runtime MUST 返回结构化拒绝
- **THEN** 工具 MUST NOT 执行

