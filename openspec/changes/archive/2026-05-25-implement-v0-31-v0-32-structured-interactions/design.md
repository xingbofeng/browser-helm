## Context

v0.2 已经提供真实页面 observation、a11y-like snapshot 和 stable ref map。v0.3 在此基础上建立了 `StructuredPageData` 和统一 tab data 外壳，但当前 `interactive` tab 仍从 `refSummary` 浅层派生，`forms` tab 仍以 `unsupported` 表达未实现状态。

本 change 覆盖两个连续能力：

- v0.31：把 ref map 进一步整理成可读、可筛选、可检查的交互元素数据。
- v0.32：在交互元素基础上读取表单字段、字段状态、校验信息和提交按钮关联。

这两个能力都保持只读边界，为 v0.33 action readiness、v0.4 Cockpit UI 和 v1.0 Page Inspector + Form Doctor 提供稳定数据基础。

```txt
v0.3 Structured Page Data
          │
          ▼
v0.31 Interactive Discovery
          │
          ▼
Interactive Element List
          │
          ▼
v0.32 Form Field Reader
          │
          ▼
Form Field Snapshot
          │
          ├── Cockpit UI v0.4
          ├── Agent Summary
          └── Trace / Runtime
```

## Goals / Non-Goals

**Goals:**

- 定义并实现 `InteractiveElement` schema，覆盖 `refId`、`role`、`name`、`tagName`、`visible`、`disabled`、`checked`、`selected`。
- 基于 ref map、DOM 属性和 a11y 语义实现 interactive discovery、ranking 和 element state reader。
- 提供只读工具：`bh_a11y_find_interactive`、`bh_element_inspect`、`bh_element_read_state`。
- 定义并实现 `FormFieldSnapshot` schema，覆盖字段身份、label、type、required、disabled、value preview、validation、aria-invalid、sensitive 和 submit 关联。
- 实现 form reader、label resolver、validation reader、submit detector 和 sensitive field masker。
- 提供只读 form 工具：`bh_form_list`、`bh_form_inspect`、`bh_form_read_fields`、`bh_form_find_missing_required`、`bh_form_find_validation_errors`、`bh_form_find_disabled_submit_reason`。
- 实现最小 Run Mode Gate：`ask`、`debug`、`form` 三种显式 run mode，按 mode 裁剪 prompt tool surface 并在执行前校验工具可用性。
- 在 side panel 任务输入区提供 Ask / Debug / Form mode 选择，并在 run/trace header 展示当前 mode。
- 将 `StructuredPageData.interactive` 从浅层 ref 派生升级为 v0.31 数据，将 `StructuredPageData.forms` 从 `unsupported` 升级为 v0.32 数据。
- 保持 Agent context 只接收裁剪后的 deterministic summary，完整数据只进入 runtime snapshot / trace / UI。

**Non-Goals:**

- 不执行 click、type、select、submit 或任何 mutating action。
- 不实现 submit-with-approval 或 approval resume 流程。
- 不实现完整 Cockpit UI；side panel 只消费已有 tab data 能力范围内的数据。
- 不实现跨 iframe 或深层 shadow DOM 遍历。
- 不新增 selector 猜测器，不绕过 stable ref 生命周期。
- 不调用模型生成表单诊断摘要。
- 不实现 v1.0 完整 Mode System；本 change 不做 TaskClassifier、自动 mode 判断、permission-aware ToolSelector 或 recovery-aware 动态裁剪。

## Decisions

### 1. 以 ref map 为主索引，而不是重新生成 selector

交互元素和表单字段都必须保留 `refId`，并通过现有 `ref-map` / `ref-resolver` 生命周期解析页面元素。

备选方案：为每个元素生成 CSS selector 或 XPath。放弃该方案，因为 selector 容易受页面结构变化影响，也会绕开 v0.2 已经建立的 stable ref 边界。

### 2. v0.31 输出独立 `InteractiveElement`，不继续复用 `ElementRef`

当前 v0.3 `interactive` tab 复用 `elementRefSchema` 只能表达粗略候选。v0.31 应新增专门 schema，明确状态字段和 ranking 所需的稳定 item 结构。

备选方案：继续在 `ElementRef` 上追加可选字段。放弃该方案，因为 ref summary 是底层引用摘要，interactive element 是产品语义数据；混在一起会让 ref map 承担过多后续能力。

### 3. 表单读取依赖 interactive elements，但不要求 UI 先选择元素

v0.32 的 form reader 使用 v0.31 识别结果作为候选来源，同时也可以从 DOM form/field 结构补齐遗漏字段。输出仍以 `refId` 绑定可操作目标。

备选方案：只遍历 `form.elements`。放弃该方案，因为很多现代页面使用 ARIA、非原生控件或分离式 submit button，单靠原生 form 结构会漏掉关键字段和按钮。

### 4. 敏感值默认 mask，并在 schema 中显式表达 `sensitive`

password、token、secret、api key、otp 等字段的 `valuePreview` 必须默认 mask。工具、trace、UI、Agent summary 都只能拿到 mask 后的预览。

备选方案：完整值进入 trace，只在 UI mask。放弃该方案，因为 trace 和 Agent context 也是隐私边界，不能依赖展示层兜底。

### 5. disabled submit reason 只做只读推断

v0.32 可以根据 required empty、validation error、aria-invalid、disabled field、disabled submit button 等信号返回可能原因，也必须在无法判断时明确说明不确定。

备选方案：执行填表或模拟提交来推断原因。放弃该方案，因为 v0.32 是只读诊断，动作执行和审批属于后续版本。

disabled submit reason 必须区分 `confirmed`、`inferred` 和 `unknown`。`confirmed` 表示有直接页面证据，例如浏览器 `validationMessage` 或明确 required empty；`inferred` 表示根据字段状态和 disabled submit 的组合合理推断，但页面没有直接声明原因；`unknown` 表示 submit disabled 但没有足够只读信号判断原因。UI 和 summary 使用中文展示“已确认 / 推断 / 无法判断”。

### 6. 局部失败进入 warnings，不阻断整个 snapshot

单个元素 role/name 解析失败、字段 label 解析失败、validation 读取异常或 submit button 未找到，都应进入 tab/tool warnings。只有整体读取入口不可用时才返回 error。

备选方案：任何字段失败都让整个 tab error。放弃该方案，因为页面结构经常不完整，局部可用数据对 Agent 和 QA 仍有价值。

### 7. `focusable` / `editable` 不进入 v0.31 正式契约

v0.31/v0.32 的边界是只读识别和诊断，不判断动作是否能安全执行。`focusable` 和 `editable` 可以作为内部 reader 的辅助信号，但不作为 `InteractiveElement` 的正式字段暴露。

备选方案：在 v0.31 `InteractiveElement` 中暴露 `focusable` / `editable`。放弃该方案，因为这会让 interactive data 看起来像 action readiness，模糊 v0.33 的动作前安全判断边界。

### 8. Run Mode Gate 进入本 change，完整 Mode System 留到 v1.0

本 change 会新增一批细粒度只读工具。为了避免所有工具在普通 ask 场景里同时暴露，v0.31/v0.32 先实现最小 Run Mode Gate：`AgentRunInput.mode` 默认 `ask`；side panel 可显式选择 `ask`、`debug`、`form`；prompt 只暴露当前 mode 可用工具和 `internal` 工具；ToolRouter 执行前校验工具是否允许在当前 mode 下运行；trace 记录 mode。

可见性规则：

| Run Mode | 可见工具 |
| --- | --- |
| `ask` | `ask` + `internal` |
| `debug` | `ask` + `debug` + `internal` |
| `form` | `ask` + `form` + `internal` |

备选方案：把完整 Mode System 提前到本 change。放弃该方案，因为 TaskClassifier、ToolSelector、permission-aware/risk-aware 动态裁剪和 recovery policy 属于 v1.0 成品闭环；本阶段只需要最小门禁来保护新增工具面。

### 9. 0.31/0.32 做最小 Side Panel UI，不提前实现完整 Cockpit

0.31 的 `交互元素` tab 应展示真实 count、empty/error 状态、元素列表和基础选中详情。0.32 的 `表单字段` tab 应展示字段 count、required、validation error、submit disabled summary、字段列表和 disabled submit reason 的中文置信标签。

备选方案：只接入数据，不做可见 UI。放弃该方案，因为数据能力没有最小可见面时难以验收。完整搜索筛选、Trace drilldown、复杂布局和 Approval UI 仍属于 v0.4 或后续版本。

### 10. 表单值预览有限展示，敏感字段永远 mask

普通字段可以返回长度受限的 `valuePreview`，例如普通文本最多 32 字符、textarea 最多 80 字符、checkbox/radio/select 返回状态或选中项。敏感字段永远 mask。Agent summary 默认只包含统计和问题，不列出完整 value preview。

备选方案：普通字段也全部 mask。放弃该方案，因为 v0.32 的只读诊断需要展示足够上下文，例如空值、明显错误值和选中状态；隐私边界通过敏感检测、长度限制和 summary 裁剪控制。

### 11. Label 解析采用固定 fallback 顺序

Label resolver 使用固定优先级：`label[for]`、父级 `label`、`aria-labelledby`、`aria-label`、`placeholder`、`name`、`id`。解析失败不丢字段，只写 warnings。

备选方案：多来源拼接 label。放弃该方案，因为拼接容易制造误导性 label，固定优先级更稳定、可测。

## Risks / Trade-offs

- [Risk] 现代前端控件的 role/name/checked/selected 状态来源不一致 → Mitigation: 先覆盖原生控件、常见 ARIA 属性和 ref map 候选，复杂组件以 warnings 表达不确定。
- [Risk] label resolver 可能误判 placeholder、aria-label 和显式 label 优先级 → Mitigation: 固定解析优先级并用 fixture 覆盖冲突场景。
- [Risk] disabled submit reason 可能只能给出“可能原因” → Mitigation: schema 和文案区分 confirmed reason 与 inferred reason，无法判断时返回明确 fallback。
- [Risk] 完整字段快照可能包含敏感信息 → Mitigation: sensitive detector 在 value preview 生成前执行，测试覆盖 password/token/API key/name 命中。
- [Risk] structured data item schema 升级影响现有 side panel 和测试 → Mitigation: 分阶段先升级 schema 和 builder，再接工具与 UI 消费；保留 v0.2/v0.3 既有 observation/ref 行为。
- [Risk] v0.31 和 v0.32 同 change 增加实现面 → Mitigation: tasks 按 v0.31 先行、v0.32 后接入分组，允许先完成交互元素再实现表单字段。
- [Risk] Run Mode Gate 触碰 AgentLoop、prompt、trace 和 side panel → Mitigation: 只实现显式 mode 和静态门禁，不做自动分类和复杂策略。

## Migration Plan

1. 先实现 Run Mode Gate 和 side panel mode selector，确保新增工具不会无差别暴露。
2. 新增 schema 和 DOM/a11y reader 的测试，再实现最小 reader 通过测试。
3. 将 `StructuredPageData.interactive.items` 从 `ElementRef[]` 升级为 `InteractiveElement[]`。
4. 将 `StructuredPageData.forms` 从 `unsupported` 改为基于 form reader 的 ready/empty/partial/error。
5. 注册只读 tools，并补齐 Node 工具测试和 DOM fixture。
6. 更新 side panel 消费逻辑，让占位文案在有真实数据时自然消失，并展示最小 interactive/forms tab。
7. 运行 `npm run typecheck`、`npm run lint`、相关 Vitest；涉及 extension/content RPC 时运行 `npm run test:e2e`。

回滚策略：如果 v0.32 表单读取风险过高，可以保留 v0.31 已完成部分，并让 `forms` tab 回到 `unsupported`，但不得影响 v0.2/v0.3 observation/ref/structured 行为。Run Mode Gate 若出现阻断，可临时保留 `ask` 默认行为并禁用细粒度工具注册。

## Open Questions

- 无。
