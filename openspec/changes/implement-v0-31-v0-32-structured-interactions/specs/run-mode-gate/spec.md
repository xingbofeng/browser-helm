## ADDED Requirements

### Requirement: Run Mode 契约

系统 MUST 支持一次 Agent run 显式声明 run mode，用于控制模型可见工具和工具执行权限。

#### Scenario: 默认 ask mode
- **WHEN** Agent run input 未提供 mode
- **THEN** 系统 MUST 使用 `ask` 作为默认 run mode

#### Scenario: 支持显式 mode
- **WHEN** Agent run input 提供 `ask`、`debug` 或 `form`
- **THEN** 系统 MUST 将该值作为当前 run mode
- **THEN** run metadata 或 trace MUST 记录当前 run mode

#### Scenario: 拒绝未知 mode
- **WHEN** Agent run input 提供未知 mode
- **THEN** 系统 MUST 拒绝该输入或回退到结构化错误

### Requirement: Prompt Tool Surface 裁剪

系统 MUST 按当前 run mode 裁剪模型可见工具列表。

#### Scenario: Ask mode 工具可见性
- **WHEN** 当前 run mode 为 `ask`
- **THEN** prompt tool surface MUST 只包含 `ask` mode 工具和 `internal` mode 工具

#### Scenario: Debug mode 工具可见性
- **WHEN** 当前 run mode 为 `debug`
- **THEN** prompt tool surface MUST 包含 `ask`、`debug` 和 `internal` mode 工具
- **THEN** prompt tool surface MUST NOT 包含仅属于 `form` 的工具

#### Scenario: Form mode 工具可见性
- **WHEN** 当前 run mode 为 `form`
- **THEN** prompt tool surface MUST 包含 `ask`、`form` 和 `internal` mode 工具
- **THEN** prompt tool surface MUST NOT 包含仅属于 `debug` 的工具

### Requirement: Tool Execution Gate

系统 MUST 在工具执行前校验当前 run mode 是否允许调用该工具。

#### Scenario: 允许当前 mode 工具执行
- **WHEN** tool call 指向当前 run mode 可用的工具
- **THEN** ToolRouter MUST 正常校验 args 并执行工具

#### Scenario: 阻止当前 mode 不可用工具
- **WHEN** tool call 指向当前 run mode 不可用的工具
- **THEN** ToolRouter MUST 返回结构化错误
- **THEN** 系统 MUST NOT 执行该工具

#### Scenario: Internal 工具始终可用于 Agent 控制
- **WHEN** tool call 指向 `internal` mode 工具
- **THEN** ToolRouter MUST 允许该工具在 `ask`、`debug` 和 `form` mode 下执行

### Requirement: Side Panel Mode 入口

系统 MUST 在 side panel 任务输入区域提供最小 run mode 选择入口。

#### Scenario: 用户选择 mode 后发起 run
- **WHEN** 用户在 side panel 选择 Ask、Debug 或 Form mode 并发起任务
- **THEN** UI MUST 将对应 mode 写入 Agent run input

#### Scenario: 默认显示 Ask
- **WHEN** side panel 首次展示任务输入区域
- **THEN** mode 选择入口 MUST 默认显示 Ask

#### Scenario: Run 状态展示 mode
- **WHEN** side panel 展示 run snapshot 或 trace header
- **THEN** UI MUST 展示当前 run mode

### Requirement: v0.31/v0.32 工具 Mode 分配

系统 MUST 为 v0.31/v0.32 新增工具声明符合用途的 modes。

#### Scenario: 交互元素工具 mode
- **WHEN** 注册 `bh_a11y_find_interactive`、`bh_element_inspect` 或 `bh_element_read_state`
- **THEN** 工具 modes MUST 包含 `debug` 和 `form`
- **THEN** 工具 modes MUST NOT 只包含 `ask`

#### Scenario: 表单读取工具 mode
- **WHEN** 注册 `bh_form_list`、`bh_form_inspect` 或 `bh_form_read_fields`
- **THEN** 工具 modes MUST 包含 `form` 和 `debug`

#### Scenario: 表单诊断工具 mode
- **WHEN** 注册 `bh_form_find_missing_required`、`bh_form_find_validation_errors` 或 `bh_form_find_disabled_submit_reason`
- **THEN** 工具 modes MUST 包含 `form`
