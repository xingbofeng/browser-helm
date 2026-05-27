## Why

BrowserHelm 已经通过 v1.0 / v1.0.1 / v1.0.2 形成单 Agent side panel、真实 streaming、长页面 / iframe 读取和只读页面诊断能力，但用户仍需要手工把诊断结果转成表单填写动作。v1.1 需要把 Form Doctor 推进到“高自动化辅助填表 + 提交前强确认 + 可追溯 Debug”的成品闭环。

这次变化的关键不是重做 UI，而是在当前 BrowserHelm Agent 瀑布流和高级开发者抽屉上增加表单执行链路：Agent 可以自动推断并填写普通字段，但真实提交必须经过 submit approval，并在提交后重新观察结果。

## What Changes

- 新增 v1.1 表单执行主路径：observe -> read fields -> infer fill plan -> fill many -> verify -> submit approval card -> submit -> observe result。
- 新增高自动化填表能力：Agent 可直接填写普通文本、数字、邮箱、日期、时间、textarea、contenteditable、select、radio 和 checkbox；填写阶段不要求用户逐字段确认。
- 新增 fill plan 能力：根据用户任务、页面摘要、当前表单字段和浅层页面文本推断字段值，记录 confidence、reason、source、requested value 和 masked preview。
- 新增批量填写与恢复能力：支持 `fill_many`、单字段修复、partial success、逐字段 fallback、ref stale 自动 re-observe + retry、填写后触发 input/change/blur validation。
- 新增 verify 能力：读取 HTML5 validity、required、aria-invalid、validationMessage、可见错误文本、submit disabled reason 和实际 DOM value。
- 新增 submit-with-approval：提交前用主屏卡片阻断 run，展示表单名、字段摘要、跳过字段、validation 状态、风险说明、masked/reveal 字段值，并允许用户在 verify 失败时选择“仍然提交”。
- 新增 submit result observation：确认提交后执行真实提交，随后观察结果页或当前页面，判断 success / failure / unknown，并在页面未变化时读取表单错误。
- 增强 Debug 抽屉：保持当前右上角 icon 手动打开的抽屉形态，在现有 Trace / 工具 / 元素与表单基础上新增 `Debug` tab，展示页面健康、console/network/runtime/style 摘要、fill plan 解释和脱敏工具细节。
- 增强 trace detail：记录 `fill_plan_created`、`field_fill_started`、`field_fill_result`、`form_verify_result`、`submit_approval_requested`、`form_submit_result` 等表单生命周期事件。
- 更新 tool policy、system prompt、error codes、tool documentation、UI message rendering 和 E2E fixtures。
- 明确范围边界：v1.1 不做长期 memory / workflow replay，不做文件上传，不做原生 alert/confirm/prompt 自动处理，不做 CDP response body deep inspector，不做 screenshot/vision，不改整体视觉主题。

## Capabilities

### New Capabilities

- `assisted-form-fill`: 定义 fill plan、单字段填写、批量填写、字段类型支持、跳过规则、恢复和填写后 validation。
- `form-verify-submit`: 定义表单 verify、submit approval card、真实提交、提交后观察和提交结果判定。
- `frontend-debug-panel`: 定义 v1.1 Debug 抽屉新增 `Debug` tab、页面健康摘要、console/network/runtime/style 调试摘要和脱敏复制。
- `form-execution-trace`: 定义表单执行生命周期 trace events、字段级结果、masked/reveal 边界和审计要求。

### Modified Capabilities

- `form-fields`: 从只读 Form Doctor 扩展为 v1.1 表单执行的数据基础，要求字段快照支持可填写性、敏感/隐藏/只读/禁用/honeypot 判定和 synthetic form group。
- `approval-runtime-hook`: 扩展 submit approval 的阻断语义、approval payload、verify failed still submit 路径和 submit audit trace。
- `cockpit-ui`: 在当前 Agent side panel 和高级开发者抽屉上增加表单执行卡、submit approval card、提交结果卡和 Debug tab，不恢复旧四 Tab 主导航。
- `action-readiness`: 扩展表单填写和提交前 readiness 语义，覆盖 stale refs、不可见/disabled/readonly/hidden 字段、submit button / Enter submit 等动作准备状态。
- `tool-documentation`: 新增 v1.1 表单动作和 Debug 工具时必须同步完整工具清单、TSDoc/JSDoc、风险等级、模式和参数说明。

## Impact

- 影响 `src/page/dom/**`：新增或扩展 form action、validation、field writability、honeypot detection、submit execution 和 shallow debug readers。
- 影响 `src/tools/form/**`：新增 `bh_form_infer_fill_plan`、`bh_form_fill_field`、`bh_form_fill_many`、`bh_form_verify`、`bh_form_submit_with_approval`，并补强现有只读工具。
- 影响 `src/tools/debug/**` 与 `src/tools/element/**`：扩展 Debug tab 所需的 console/network/runtime/style 摘要和 element style inspect 消费路径。
- 影响 `src/agent/**`：更新 system prompt、ToolSelector、RecoveryPolicy、fill plan / form execution orchestration、submit approval pause/resume 和 final answer 生成。
- 影响 `src/runtime/**` 与 `src/background/runtime/**`：扩展 RunManager、RuntimeEvent、RunSnapshot messages、ApprovalManager、tool execution guard 和 submit result observation。
- 影响 `src/shared/schemas/**`：新增/扩展 fill plan、field fill result、form verify result、submit approval payload、debug summary、trace event 和 error code schema。
- 影响 `src/ui/**`：在当前 BrowserHelm Agent UI 中新增表单执行卡、verify 卡、submit approval 卡、提交结果卡，并在高级开发者抽屉新增 `Debug` tab。
- 影响 `tests/node/**`、`tests/dom/**`、`tests/e2e/**`：尽可能完整覆盖普通填写、批量/单字段/fallback、字段类型、跳过规则、多表单、synthetic form、verify、submit approval、提交结果、Debug tab、trace 和 recovery。
- 影响 `docs/design/v1.1-assisted-form-fill-and-debug/**`、`docs/roadmap/**`、`CONTEXT.md`、`implementation-notes.md` 和 `src/tools/README.md`。
