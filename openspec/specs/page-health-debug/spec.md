# page-health-debug Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: Read-only Page Health Summary
系统 MUST 提供只读浅层 page health summary，用于 v1.0 Page Inspector。

#### Scenario: 收集浅层 debug signal
- **WHEN** 用户任务进入 Debug mode
- **THEN** 系统 MUST 尝试收集 console errors、runtime exceptions、network failures 和基础页面状态摘要
- **THEN** 结果 MUST 以只读 ToolResult 或 structured page health 数据返回

#### Scenario: Debug signal 不可用
- **WHEN** console 或 network 摘要不可用
- **THEN** 系统 MUST 返回结构化 limitation 或 error
- **THEN** 表单诊断 MUST NOT 因浅层 debug signal 不可用而自动失败

### Requirement: Page Health 不使用 CDP
v1.0 page health debug MUST 不依赖 chrome.debugger 或 CDP。

#### Scenario: 不读取 deep debug 数据
- **WHEN** v1.0 执行 page health summary
- **THEN** 系统 MUST NOT 读取 request body、response body、performance waterfall 或 event listeners
- **THEN** 需要 deep debug 时 MUST 在 limitation 或 recommendation 中指向后续能力边界

