## Context

BrowserHelm 当前已经具备单 Agent side panel、自动页面观察、真实 streaming、长页面/iframe 读取、只读 Form Doctor、Action Readiness、Approval Runtime 和高级开发者抽屉。v1.1 不需要重做主 UI，也不需要恢复旧四 Tab 数据驾驶舱；它要在当前 Agent 瀑布流上增加可执行表单链路，并在现有 Debug 抽屉里增加表单执行和页面健康调试能力。

当前 `src/tools/form/` 仍以只读工具为主：list、inspect、read fields、missing required、validation errors、disabled submit reason。v1.1 需要新增 form action 层，让 Agent 可以自动推断普通字段值、批量填写、验证、请求提交确认并执行真实提交。填写阶段按用户决策不逐字段确认；提交阶段必须通过 approval card 阻断。

调研上，v1.1 主要吸收 WebBrain 的 verify-first、mutating tool 后验证、trace/context 管理，以及 BrowserBee 的 canonical sequence / tool sequence macro / approval 意识；不照搬 Sarathi 的粗粒度多 action 直执行、BrowserBee 的 XML tool call、BrowserKing 的 screenshot-first 或 onUI 的外部 annotation 工作流。

## Goals / Non-Goals

**Goals:**

- 建立 v1.1 表单执行主路径：observe -> read fields -> infer fill plan -> fill many -> verify -> submit approval -> submit -> observe result。
- 支持高自动化普通字段填写：text、email、number、date、time、textarea、contenteditable、select、radio、checkbox。
- 支持批量填写、单字段修复、partial success、fallback、ref stale re-observe retry、validation 触发和 actual DOM state 回读。
- 支持 verify 和 submit approval：submit 前强制 verify，approval card 展示字段摘要、masked/reveal 值、跳过字段、风险、verify 状态和“仍然提交”路径。
- 增强当前 Agent 主屏和高级开发者抽屉：新增表单执行卡、verify 卡、submit approval 卡、提交结果卡，以及 Debug tab。
- 扩展 trace / tool detail / error codes，保证自动填写和提交可追溯。
- 尽可能完整补测试：DOM、tool、runtime、UI、E2E 和真实 extension 截图验收。

**Non-Goals:**

- 不做长期 memory、domain workflow memory 或 workflow replay；只允许单次 run 内 ephemeral fill plan。
- 不做文件上传；`input[type=file]` 只识别并跳过。
- 不做原生 alert/confirm/prompt 自动处理。
- 不做 CDP response body deep inspector。
- 不做 screenshot/vision。
- 不做 multi-tab、PDF、upload/download、domain adapters 或 sub-agent。
- 不改整体视觉主题；沿用当前 BrowserHelm 暖色 side panel 和高级开发者抽屉。

## Decisions

### 1. 表单执行使用专用 form tools，而不是只复用 element tools

选择新增 `bh_form_infer_fill_plan`、`bh_form_fill_field`、`bh_form_fill_many`、`bh_form_verify`、`bh_form_submit_with_approval`。`bh_element_type_text` / `bh_element_click` 继续作为底层能力和恢复路径，但主路径由 form tools 聚合字段级结果。

替代方案是让 Agent 多次调用 element tools。该方案实现更少，但无法稳定表达 partial success、字段级 validation、跳过规则、submit approval payload 和表单级 trace，因此不适合作为 v1.1 产品闭环。

### 2. 填写不逐字段确认，提交必须确认

用户明确选择“填写都不需要确认，随便填”。因此普通字段填入页面前不弹确认，Agent 可以直接执行 fill plan。安全边界转移到：敏感/隐藏/disabled/readonly/invisible/honeypot/file 字段跳过，填写后 verify，真实提交前 approval card 阻断。

替代方案是推断字段填写前确认。该方案更保守，但会破坏 v1.1 的高自动化体验。

### 3. Fill plan 是可追溯能力

`bh_form_infer_fill_plan` 可以作为真实能力暴露，并输出字段级 value、source、confidence、reason、target form 和 skipped sensitive/unsupported 信息。主 UI 默认不强调“推断”标签，但 Debug/trace 必须保留来源和理由。

替代方案是只让模型内部推理、不落 trace。该方案更轻，但填错后无法解释，也不利于测试和调试。

### 4. Fill many 支持 fallback 与有限自动恢复

`bh_form_fill_many` 接受结构化字段目标和值，一次只作用于一个 form。工具支持 partial success；遇到 stale ref 可自动 re-observe 并最多 retry 一次；批量失败可 fallback 到逐字段填写；最终仍需要 `bh_form_verify` 回读 actual DOM state。

替代方案是所有恢复都交给 AgentLoop。该方案 trace 更纯，但在动态页面中体验较差。v1.1 采用有限自动恢复，同时通过 trace 标记 retry。

### 5. 字段写入遵守页面限制

隐藏字段、disabled、readonly、不可见字段、honeypot 候选字段、敏感字段和 file upload 字段均不写入。contenteditable 只支持纯文本，不插入富文本/HTML。checkbox/radio/select 使用 desired state / option value，保持幂等。

替代方案是绕过 DOM 限制直接设置属性。该方案风险高，容易误触业务状态或反爬字段，不采用。

### 6. Verify 是 submit 前硬门槛，但允许高风险仍然提交

提交前必须调用 `bh_form_verify`。如果 verify 失败，默认阻断提交；用户可以在 approval card 选择“仍然提交”，此路径必须显示高风险样式并记录 trace。

替代方案是 verify 失败时绝对不能提交。该方案安全但不符合真实页面调试需求，用户可能需要提交以观察服务端错误或复现问题。

### 7. Submit 走真实用户路径，不直接调用 `form.submit()`

submit 优先点击 submit button；没有 submit button 时才使用 Enter submit。不得直接调用 `form.submit()`，因为它会绕过事件和浏览器 validation。提交后必须重新 observe/read 当前页面，使用 URL 变化、success text/toast、form reset、错误消失、network/page health 等多信号判断 success / failure / unknown。

### 8. UI 在当前 Agent side panel 上增量演进

主屏新增表单任务卡、填写进度卡、verify 卡、submit approval 卡和提交结果卡。DebugPanel 保持当前右上角 icon 手动打开的抽屉形态，新增 `Debug` tab，不默认展开，不新增主导航，不恢复旧四 Tab。

设计图保存在 `docs/design/v1.1-assisted-form-fill-and-debug/01-assisted-form-fill-debug-ui.png`，作为视觉和信息架构参考。

### 9. Debug tab 分用户摘要和开发者细节

主屏只给简短失败原因和下一步建议。Debug tab 展示页面健康、console/network/runtime exception、computed style 关键属性、fill plan summary、form execution detail 和脱敏 JSON 复制。工具原始结果继续在工具 tab 展示；Debug tab 负责解释版 summary。

### 10. 测试按风险扩展

v1.1 涉及真实页面 mutation 和 submit，需要从 DOM 单测、tool 单测、runtime/approval 单测、UI 单测到 E2E fixture 全覆盖。E2E 只用本地 fixture，不碰第三方真实网站。

## Risks / Trade-offs

- [Risk] 填写不逐字段确认可能导致误填页面状态 → Mitigation：不写敏感/隐藏/不可见/禁用/只读/honeypot/file 字段；verify 后主屏展示结果；submit 前 approval 阻断。
- [Risk] Agent 推断字段值可能填错 → Mitigation：fill plan 记录 source/confidence/reason，提供用户修改字段入口，Debug/trace 可复盘。
- [Risk] 动态页面导致 refs stale 或填写后页面变化 → Mitigation：`fill_many` 最多一次 re-observe retry，结果标记 changedPage/requiresObserve，最终 verify 回读 DOM。
- [Risk] 自动勾选条款/订阅类 checkbox 有授权含义 → Mitigation：允许填写，但 submit approval 必须展示 checkbox/radio/select 当前选择和风险摘要。
- [Risk] Verify 失败仍然提交可能产生业务副作用 → Mitigation：高风险样式、明确 warning、用户显式确认、trace audit。
- [Risk] Submit 成功判断不稳定 → Mitigation：支持 unknown 状态；页面未变化时读取错误并解释，不假装成功。
- [Risk] Debug 信息泄露字段值或 secrets → Mitigation：默认 mask，逐字段 eye reveal，复制仅允许脱敏 JSON。
- [Risk] 测试矩阵很大导致交付周期变长 → Mitigation：按工具/DOM/UI/E2E 分层，优先本地 fixtures 和最小可复现页面，保留明确任务拆分。
