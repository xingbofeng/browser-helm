## Why

v0.3 已经把页面 observation 和 ref map 整理成统一的 Structured Page Data，但 interactive 和 forms 仍停留在浅层或 unsupported 状态。v0.31/v0.32 需要补上只读交互元素识别和表单字段读取，让 Agent、Cockpit UI、trace/runtime 都能稳定理解“页面上能操作什么”和“表单为什么不能提交”。

## What Changes

- 新增完整 interactive element discovery，从 v0.2 ref map 和 DOM/a11y 信息派生可点、可输入、可选择元素列表。
- 新增 `InteractiveElement` 数据契约，表达 `refId`、`role`、`name`、`tagName`、`visible`、`disabled`、`checked`、`selected` 等状态。
- 新增只读 element 工具：查找交互元素、检查单个元素、读取元素状态。
- 新增 form field reader，在 interactive elements 基础上读取 form、field、label、required、value preview、validation、aria-invalid 和 submit button 关联。
- 新增敏感字段默认 mask 规则，password/token/API key 等字段不得在 UI、trace 或 Agent summary 中暴露明文。
- 新增只读 form 工具：列出表单、检查表单、读取字段、查找缺失必填、查找校验错误、推断 disabled submit 原因。
- 新增 Run Mode Gate：run 可显式指定 `ask`、`debug` 或 `form`，prompt 只暴露当前 mode 可用工具，执行前阻止不允许的工具。
- Side panel 任务输入区新增最小 mode 选择入口，并在 run/trace header 展示当前 mode。
- 将 v0.3 `interactive` tab 从浅层 ref 派生升级为 v0.31 真实交互元素数据，将 `forms` tab 从 unsupported 升级为 v0.32 表单字段快照。
- 明确本 change 不执行 click/type/submit，不实现 submit-with-approval，不处理 iframe/shadow DOM 深度遍历。

## Capabilities

### New Capabilities

- `interactive-elements`: 定义 v0.31 交互元素识别、状态读取、只读工具和 tab data 行为。
- `form-fields`: 定义 v0.32 表单字段读取、label/validation/submit 诊断、敏感字段 mask 和只读工具行为。
- `run-mode-gate`: 定义 v0.31/v0.32 所需的最小 run mode、工具可见性裁剪、执行门禁和 side panel mode 入口。

### Modified Capabilities

- 无。

## Impact

- 页面 a11y/DOM 模块：`src/page/a11y/**`、`src/page/dom/**`。
- 工具模块：`src/tools/a11y/**`、`src/tools/element/**`、`src/tools/form/**`。
- 共享 schema：新增或扩展 interactive element、form field snapshot、tab data item 类型。
- Structured Page Data：`interactive` tab 接入 v0.31 完整数据，`forms` tab 接入 v0.32 表单快照。
- Runtime / trace / context：完整只读快照保存到 runtime/trace，Agent context 只接收裁剪后的 deterministic summary。
- Agent runtime：`AgentRunInput` 增加 run mode，ToolRouter / prompt / trace 按 mode 裁剪和记录工具可见性。
- Side panel：新增 Ask / Debug / Form mode 选择；interactive/forms tab 提供最小真实数据展示，但完整 Cockpit UI 仍属于 v0.4。
- 测试：新增 DOM 单测、Node 工具测试、fixtures；涉及 structured tab data 接入时补充相关集成测试。
- 不预计新增外部依赖。
