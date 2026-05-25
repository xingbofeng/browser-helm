## ADDED Requirements

### Requirement: Human-readable DebugReport
系统 MUST 为 v1.0 Debug/Form run 生成用户可读 DebugReport。

#### Scenario: Report 展示诊断结果
- **WHEN** Debug 或 Form run 完成
- **THEN** DebugReport MUST 包含 title、findings、recommendations 和可选 limitations
- **THEN** Cockpit UI MUST 能展示该 report 的主要内容

#### Scenario: Report 保留不确定性
- **WHEN** 系统无法完整读取页面、表单或 debug signal
- **THEN** DebugReport MUST 在 limitations 中说明不可用原因
- **THEN** 系统 MUST NOT 假装诊断完整

### Requirement: DebugReport 与 trace 分离
DebugReport MUST 面向用户总结诊断，不替代完整 trace 或 ToolResult。

#### Scenario: 完整数据不反向注入上下文
- **WHEN** DebugReport 展示 findings 和 evidence
- **THEN** 完整 ToolResult MUST 继续保留在 trace/storage
- **THEN** 模型上下文 MUST 只接收受 ContextPolicy 限制的摘要
