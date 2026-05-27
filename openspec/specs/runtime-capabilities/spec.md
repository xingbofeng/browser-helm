# runtime-capabilities Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: Runtime Capability Model
系统 MUST 提供 v1.0 runtime capability / permission model，供 ToolSelector 和 PolicyEngine 判断工具可用性。

#### Scenario: Capability 影响工具可见性
- **WHEN** runtime 缺少工具需要的 capability 或 permission
- **THEN** ToolSelector MUST 隐藏对应工具
- **THEN** runtime 执行前校验 MUST 返回结构化不可用原因

#### Scenario: Capability 写入诊断 limitation
- **WHEN** Debug/Form 诊断因 capability 不足而无法完成
- **THEN** DebugReport MUST 记录 limitation
- **THEN** Cockpit UI MUST 能展示该能力缺口

### Requirement: v1.0 Capability 范围
v1.0 capability model MUST 覆盖 activeTab、host permission、浅层 debug signal 可用性、tool risk 和 approval boundary。

#### Scenario: CDP capability 仅预留
- **WHEN** v1.0 runtime capabilities 被计算
- **THEN** 系统 MAY 表达 debugger/CDP capability 为 unavailable 或 reserved
- **THEN** v1.0 MUST NOT 要求 chrome.debugger 权限

