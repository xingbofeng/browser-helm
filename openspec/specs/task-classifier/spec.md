# task-classifier Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: 规则优先 TaskClassifier
系统 MUST 提供规则优先的 TaskClassifier，将用户任务映射到 Ask、Debug、Form 或 Act mode，并输出 reason 与 confidence。

#### Scenario: 表单任务分类为 Form
- **WHEN** 用户任务包含表单、字段、必填、校验、disabled 或不能提交等语义
- **THEN** TaskClassifier MUST 返回 Form mode
- **THEN** classification MUST 包含用户可见 reason

#### Scenario: 页面错误任务分类为 Debug
- **WHEN** 用户任务包含报错、console、network、页面坏了或异常等语义
- **THEN** TaskClassifier MUST 返回 Debug mode
- **THEN** classification MUST 包含 confidence

#### Scenario: 动作任务分类为 Act
- **WHEN** 用户任务要求点击、输入、提交、发送、删除、上传或执行页面动作
- **THEN** TaskClassifier MUST 返回 Act mode
- **THEN** 系统 MUST 将 Act 解释为动作准备而不是自动执行

### Requirement: 低置信度分类安全降级
TaskClassifier MUST 在低置信度时安全降级，不得扩大工具暴露面。

#### Scenario: 无法确定 mode
- **WHEN** 用户任务无法可靠分类
- **THEN** 系统 MUST 默认使用 Ask mode 或进入 waiting_for_user
- **THEN** 系统 MUST NOT 因低置信度分类暴露 Debug、Form 或 Act 专用工具

