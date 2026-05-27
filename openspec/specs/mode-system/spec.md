# mode-system Specification

## Purpose
TBD - created by archiving change implement-v1-0-page-inspector-form-doctor. Update Purpose after archive.
## Requirements
### Requirement: v1.0 Mode System
系统 MUST 提供 v1.0 Mode System，用于把用户任务、工具可见性、prompt/context policy、risk policy 和用户可见运行状态绑定到 Ask、Debug、Form、Act 四种 mode。

#### Scenario: Mode System 输出可解释 mode
- **WHEN** 用户发起一次 Agent run
- **THEN** 系统 MUST 为该 run 确定 Ask、Debug、Form 或 Act mode
- **THEN** run metadata、trace 和 Cockpit UI MUST 展示 mode reason

#### Scenario: Mode System 不替代执行前安全门禁
- **WHEN** Mode System 选择某个 mode 并裁剪工具
- **THEN** ToolRouter 或 runtime MUST 仍在执行前校验 mode、risk、capability 和 policy
- **THEN** 模型 MUST NOT 通过输出隐藏工具名绕过执行前校验

### Requirement: Act mode 边界
v1.0 的 Act mode MUST 表达动作准备、risk/readiness/policy/approval 边界，不得执行 v1.1 的填写或提交动作。

#### Scenario: Act mode 不执行填写或提交
- **WHEN** 用户任务被分类为 Act mode
- **THEN** 系统 MAY 展示动作前检查和 approval boundary
- **THEN** 系统 MUST NOT 在 v1.0 自动填写字段、verify submit 或执行 submit-with-approval

#### Scenario: Act mode 保留高风险审批
- **WHEN** Act mode 中的工具或拟执行动作风险为 high
- **THEN** runtime MUST 创建 approval request 或返回 approval required 结果
- **THEN** 动作 MUST NOT 在 approval 前执行

