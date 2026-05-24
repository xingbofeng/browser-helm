## 背景

v0.2 已经建立真实页面 observation：content RPC、stable refs、`Observation`、`ObservationContextSummary`，以及最小 runtime / side panel snapshot。下一步不是做更完整的 UI，也不是执行页面动作，而是提供一个稳定的数据契约，让 UI、trace、runtime 和 Agent context 都能消费同一层结构化页面数据。

当前 observation 输出已经包含页面元信息、可见文本摘要、页面状态摘要和 `refSummary`，但还没有按产品视角拆成稳定数据类别，也没有统一表达 ready、empty、partial、error、unsupported 等 tab 状态。如果没有这一层，v0.31 / v0.32 / v0.33 和 v0.4 会各自重新解释原始 observation 数据。

## 目标 / 非目标

**目标：**

- 定义 `StructuredPageData`，包含 observation、refs、interactive、forms 四类 tab data。
- 定义统一 `TabData<TItem>` 外壳，包含确定性的 status、summary、count、items、updatedAt、warnings、error、emptyReason。
- 从 v0.2 observation/ref map 输出生成 structured page data，不新增模型可见工具。
- 完整 structured page data 可进入 runtime snapshot / trace；Agent context 只接收确定性裁剪摘要。
- 明确区分 `empty` 和 `unsupported`。
- 保持 v0.1 / v0.2 行为和契约兼容。

**非目标：**

- 不做超出 v0.2 `ElementRef` 字段的完整交互元素识别。
- 不做完整 form field reader、label resolver、value masking、validation reader 或 submit detector。
- 不做 action readiness、risk classification、approval lifecycle、click/type/submit 或任何 mutating browser tools。
- 不做完整 Cockpit UI 的搜索、筛选、详情交互。
- 不调用模型生成 summary。
- 不引入 sub-agent、planner 或 terminal decision 重构。

## 设计决策

### 决策：将 structured page data 建模为四类产品 tab data

`StructuredPageData` 包含 `observation`、`refs`、`interactive`、`forms` 四类 tab data。这些名称与计划中的 Cockpit 面板一致，也为 runtime 和 trace 提供稳定边界。

备选方案：保留一个扁平 page data 对象。放弃该方案，因为 UI 和 summary 逻辑会重复创建分类边界。

### 决策：使用统一 tab data 外壳

每类 tab data 共享 `status`、`summary`、`count`、`items`、`updatedAt`、`warnings`、可选 `error`、可选 `emptyReason`。统一外壳能让 empty/error/partial 处理一致且可测试。

备选方案：让每类 tab data 自己定义状态字段。放弃该方案，因为 v0.3 的目标就是收敛分散的状态语义。

### 决策：区分 empty 和 unsupported

`empty` 表示系统已经检查过，但没有找到匹配数据。`unsupported` 表示当前版本或页面能力还不能产出该类数据。这个区别对 v0.3 的 forms 尤其重要：完整 form reader 不在本版本范围内，不能误报成“页面没有表单”。

备选方案：用 `empty` 同时表示没有数据和未实现。放弃该方案，因为它会隐藏能力缺口，并误导 UI / Agent summary。

### 决策：用确定性规则生成 summary，不调用模型

Tab summary 和 context summary 由代码规则生成，例如计数、重点 refs、warning/error 摘要和已知页面元信息。v0.3 不调用模型总结页面数据。

备选方案：让模型总结 structured page data。放弃该方案，因为 v0.3 需要低延迟、低成本、可测试，并避免 prompt injection、隐私和 provider 依赖风险。

### 决策：v0.3 不新增模型可见 structured data tool

Structured page data builder 在 observation 后作为内部 adapter 运行。模型继续看到普通工具 summary / context summary，而不是新的 `bh_page_structured_data` 工具。

备选方案：立刻暴露 `bh_page_structured_data`。放弃该方案，因为它会在 action/form/interactive 语义稳定前扩大工具面，使模型行为更难推理。

### 决策：v0.3 允许浅层 interactive 数据

Interactive tab 可以从 v0.2 `refSummary` 浅层派生，例如 `refId`、`role`、`name`、`tagName`、`visible`、`disabled`。完整 checked/selected/focusable/editable 状态属于 v0.31。

备选方案：在 v0.3 实现完整 interactive discovery。放弃该方案，因为这会混淆 v0.3 和 v0.31 的边界。

### 决策：v0.3 的 forms 可以是 unsupported

Forms tab contract 必须存在，但 v0.3 不要求完整 form reading。如果 form reading 尚未实现，forms tab 返回 `unsupported`，并给出清楚 summary，不做误导性诊断。

备选方案：现在实现 label/required/validation 读取。放弃该方案，因为这是 v0.32 的能力，需要独立测试和设计。

## 风险 / 权衡

- `forms` 在 v0.3 可能看起来不够有用，因为它可以是 `unsupported` → 缓解：明确 status，并指向 v0.32 作为补全能力。
- 浅层 `interactive` 数据可能不足以后续动作使用 → 缓解：明确 v0.31 负责完整 interactive discovery 和状态读取。
- Runtime snapshot 形状可能增长过快 → 缓解：完整 structured data 不进入 Agent context，并用聚焦测试覆盖 snapshot 增量。
- Summary 规则可能在不同 tab 之间不一致 → 缓解：集中在 structured data adapter 中生成，并覆盖每种 tab status 的测试。
- v0.2 observation 行为可能回归 → 缓解：structured data 作为派生层实现，不改变 observation 语义，并保留 v0.2 测试。
