# BrowserHelm Tools

本目录存放 BrowserHelm 的工具实现。工具通过 `ToolSpec` 暴露给 Agent runtime，每个工具都必须声明 `name`、`title`、`description`、`modes`、`risk`、`argsSchema`、`resultSchema` 和 `execute`。

`title` 字段旁的代码注释用于说明工具在 Agent 语义里的用途：它不是 UI 文案替代品，而是维护者阅读工具清单时的快速定位。

## 已实现工具

| 工具名 | Title | 目录 | 模式 | 风险 | 参数 | 含义 |
| --- | --- | --- | --- | --- | --- | --- |
| `bh_agent_finish` | Agent Finish | `agent/` | `internal` | `safe` | `message` | Agent 正常完成当前 run，返回最终摘要。 |
| `bh_agent_fail` | Agent Fail | `agent/` | `internal` | `safe` | `message`, `code?` | Agent 无法继续或确认失败，返回结构化失败结果。 |
| `bh_agent_ask_user` | Agent Ask User | `agent/` | `internal` | `safe` | `question` | Agent 缺少必要用户输入时暂停 run，并把问题交还给用户。 |
| `bh_action_check_readiness` | Check Action Readiness | `action/` | `debug`, `act` | `low` | `kind`, `refId`, `source`, `valuePreview?` | 只读检查拟执行动作的目标、风险、approval 预判和重新观察需求，不修改页面。 |
| `bh_page_observe` | Page Observe | `page/` | `ask`, `debug`, `form` | `safe` | 无 | 读取当前页面 bounded observation，并生成裁剪后的 structured context summary。 |
| `bh_frame_list` | Frame List | `frame/` | `debug`, `form`, `act` | `safe` | 无 | 列出当前页面 frame id、URL 和顶层/子 frame 关系，用于 iframe 表单与动态 widget 排障。 |
| `bh_iframe_read` | Read Iframe Target | `frame/` | `debug`, `act` | `low` | `refId`, `frameId?` | 只读读取 iframe 内 stable ref 摘要，不触发 approval，不修改页面。 |
| `bh_iframe_click` | Click Iframe Target | `frame/` | `act` | `high` | `refId`, `frameId?` | 对 iframe 内目标执行受控点击，执行前强制 runtime approval、readiness 和 action token。 |
| `bh_iframe_type` | Type In Iframe Target | `frame/` | `act` | `high` | `refId`, `frameId?`, `text`, `valuePreview` | 对 iframe 内文本目标执行受控输入，执行前强制 runtime approval，敏感值只进入 mask preview。 |
| `bh_a11y_snapshot` | A11y Snapshot | `a11y/` | `ask`, `debug`, `form` | `safe` | 无 | 捕获当前页面 a11y-like 快照，返回带 stable refs 的候选元素。 |
| `bh_a11y_find_interactive` | Find Interactive Elements | `a11y/` | `debug`, `form` | `safe` | 无 | 读取当前页面 v0.31 交互元素列表，包含 ref、role、name 和只读状态。 |
| `bh_a11y_refresh_refs` | Refresh Refs | `a11y/` | `ask`, `debug`, `form` | `safe` | 无 | 页面结构变化后刷新 ref map，重新建立 ref 到元素的映射。 |
| `bh_a11y_resolve_ref` | Resolve Ref | `a11y/` | `ask`, `debug`, `form` | `safe` | `refId` | 将已有 `ref_id` 解析为当前页面元素摘要，并暴露 `REF_STALE` 等错误。 |
| `bh_element_inspect` | Inspect Element | `element/` | `debug`, `form` | `safe` | `refId` | 检查单个交互元素的 role、name、tagName 和可用状态。 |
| `bh_element_read_state` | Read Element State | `element/` | `debug`, `form` | `safe` | `refId` | 读取单个交互元素的 visible、disabled、checked、selected 状态。 |
| `bh_form_list` | List Forms | `form/` | `debug`, `form` | `safe` | 无 | 列出当前页面表单概览，包括字段数量和 submit 状态。 |
| `bh_form_inspect` | Inspect Form | `form/` | `debug`, `form` | `safe` | `formRefId?` | 检查表单字段和 submit 摘要，不执行填写或提交。 |
| `bh_form_read_fields` | Read Form Fields | `form/` | `debug`, `form` | `safe` | 无 | 读取当前页面表单字段快照。 |
| `bh_form_find_missing_required` | Find Missing Required Fields | `form/` | `form` | `safe` | 无 | 找出 required 且当前值为空的字段。 |
| `bh_form_find_validation_errors` | Find Validation Errors | `form/` | `form` | `safe` | 无 | 找出 validation failed 或 aria-invalid 的字段。 |
| `bh_form_find_disabled_submit_reason` | Find Disabled Submit Reason | `form/` | `form` | `safe` | 无 | 读取 disabled submit 的已确认、推断或无法判断原因。 |

## 目录约定

| 目录 | 责任 |
| --- | --- |
| `agent/` | Agent 内部控制工具，用于 finish、fail、ask user 等 run 级状态。 |
| `action/` | 动作准备状态和动作前安全检查工具；v0.33 开始补齐。 |
| `page/` | 页面观察入口，负责从 content runtime 获取页面 observation。 |
| `frame/` | frame/iframe 读取、诊断和受控动作工具；v0.33 开始承接 iframe action prototype。 |
| `a11y/` | a11y-like snapshot、stable ref map 和 ref 解析工具。 |
| `element/` | 单元素检查和状态读取工具；v0.31 开始补齐。 |
| `form/` | 表单读取和诊断工具；v0.32 开始补齐。 |
| `core/` | 工具注册、路由、结果工厂、错误和上下文类型。 |

## 新增工具要求

- 工具文件名使用 kebab-case，协议名保留 `bh_` 前缀。
- `title` 字段旁必须有一句注释，说明工具的 Agent 语义和使用时机。
- `description` 面向模型工具契约，必须短而明确。
- 高风险或会修改页面状态的工具必须正确设置 `risk`，并走 approval policy。
- 新工具加入后必须同步更新本 README 的已实现工具表格。
