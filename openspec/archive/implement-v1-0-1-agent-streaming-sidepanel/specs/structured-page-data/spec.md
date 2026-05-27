## ADDED Requirements

### Requirement: 元素与表单合并表
v1.0.1 Debug MUST provide a merged “元素与表单” table combining ref mapping, interactive elements and form fields.

#### Scenario: 合并显示
- **WHEN** Structured Page Data 包含 refs、interactive elements 或 form fields
- **THEN** Debug “元素与表单” Tab MUST 使用一张表展示这些数据
- **THEN** UI MUST NOT 要求用户在 Ref、交互元素、表单字段三个独立 Debug Tab 之间切换

#### Scenario: 表格字段
- **WHEN** 元素与表单表渲染一行
- **THEN** 表格 SHOULD 展示类型、名称/标签、role/tag、状态、校验/提交、ref_id 或等价字段
- **THEN** 选中详情 SHOULD 展示 accessible name、required/disabled/visible、validation message、submit reason 和 ref_id

#### Scenario: 搜索与过滤
- **WHEN** 用户在元素与表单表中搜索或点击 chips
- **THEN** UI MUST 支持按名称、标签、role、tag、ref_id、异常或禁用状态过滤
- **THEN** chips SHOULD 包含全部、表单字段、按钮、异常、禁用或等价选项

### Requirement: 合并表敏感值遮蔽
元素与表单表 MUST mask sensitive values.

#### Scenario: 敏感字段显示
- **WHEN** 表单字段类型或名称表示 password、token、otp、api key 或其他敏感语义
- **THEN** 表格和详情 MUST 显示 masked preview
- **THEN** 明文敏感值 MUST NOT 出现在 Debug 表格中

### Requirement: Structured Page Data UI 消费边界
Structured Page Data MAY 继续提供 observation、refs、interactive 和 forms 四类数据，但 v1.0.1 UI MUST consume refs/interactive/forms through the merged Debug table.

#### Scenario: 数据契约不因 UI 合并丢失
- **WHEN** runtime 生成 Structured Page Data
- **THEN** 原始 refs、interactive 和 forms 数据 MAY 保持各自 schema
- **THEN** UI 合并表 MUST 不改变模型上下文压缩边界或 tool execution ref 边界
