## ADDED Requirements

### Requirement: Page Inspector 诊断输入
Page Observation capability MUST 为 v1.0 Page Inspector 提供只读诊断输入。

#### Scenario: Observation 作为 evidence source
- **WHEN** 系统生成 Page Inspector finding
- **THEN** finding evidence MAY 引用 observation URL、title、domain、page state、visible text summary 或 ref summary
- **THEN** evidence MUST 保留来源边界

#### Scenario: Page health summary 纳入 observation flow
- **WHEN** Debug mode 需要页面健康摘要
- **THEN** 系统 MUST 能把 page health summary 与 observation summary 一起提供给 DebugReport
- **THEN** 完整页面数据 MUST 继续受 ContextPolicy 限制

### Requirement: Page Inspector 空状态
Page Inspector MUST 对无明显异常的页面返回明确空状态，而不是空白报告。

#### Scenario: 未发现明显异常
- **WHEN** observation 与 page health summary 均未发现明显异常
- **THEN** DebugReport MUST 明确说明未发现明显页面异常
- **THEN** report MAY 提供下一步建议或 limitation
