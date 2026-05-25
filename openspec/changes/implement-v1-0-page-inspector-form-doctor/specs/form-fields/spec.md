## ADDED Requirements

### Requirement: Form Doctor 只读诊断
Form Fields capability MUST 支持 v1.0 Form Doctor 的只读诊断输出。

#### Scenario: 输出字段诊断
- **WHEN** 当前页面包含表单字段
- **THEN** 系统 MUST 能输出字段列表、label/name/type、required、disabled、invalid、validationMessage、sensitive 和 valuePreview
- **THEN** valuePreview MUST 遵守敏感字段遮蔽规则

#### Scenario: 输出表单问题 finding
- **WHEN** 系统发现 missing required、validation error 或 disabled submit reason
- **THEN** 系统 MUST 生成带 evidence 和 confidence 的 AgentFinding
- **THEN** DebugReport MUST 能引用这些 findings

### Requirement: Form Doctor 不执行表单动作
v1.0 Form Doctor MUST 不填写、verify 或提交表单。

#### Scenario: 用户要求填写或提交
- **WHEN** 用户任务要求填写字段、verify submit 或执行提交
- **THEN** TaskClassifier MUST 将任务归入 Act 或后续能力边界
- **THEN** v1.0 MUST NOT 执行填写、verify 或 submit-with-approval
