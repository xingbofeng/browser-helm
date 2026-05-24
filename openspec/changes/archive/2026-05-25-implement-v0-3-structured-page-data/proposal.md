## 为什么

v0.2 已经能观察真实页面并生成 observation/ref 数据，但下游 UI、runtime、trace 和 Agent context 仍缺少稳定的结构化页面数据契约。v0.3 需要在 Cockpit UI、交互元素、表单字段和动作准备继续扩大前，先把 observation 输出整理成一致的 tab data、确定性摘要和状态语义。

## 改动内容

- 引入 `StructuredPageData` 契约，包含 observation、refs、interactive、forms 四类 tab data。
- 定义统一 tab data 外壳：`status`、`summary`、`count`、`items`、`updatedAt`、`warnings`、可选 `error`、可选 `emptyReason`。
- 明确区分 `empty` 和 `unsupported` 两种 tab 状态。
- 新增 structured page data builder / adapter，从 v0.2 observation/ref map 派生 v0.3 数据。
- 新增 deterministic context summary 规则：Agent context 只接收裁剪摘要，完整数据保留到 runtime snapshot / trace。
- 明确 v0.31 交互元素完整识别、v0.32 表单字段完整读取、v0.33 action readiness 不属于本 change。
- v0.3 不新增模型可见的 structured data tool；structured data 在 observation 后的 runtime/page 数据流内部生成。

## 能力范围

### 新增能力

- `structured-page-data`：定义 v0.3 结构化页面数据契约、tab data 状态、adapter 行为和确定性 summary 边界。

### 修改能力

- 无。

## 影响范围

- 页面数据模块：`src/page/structured/**`。
- 共享 schema：`src/shared/schemas/structured-page-data.ts`、tab schema 模块和相关类型。
- Runtime surface：runtime snapshot 可包含从 observation 派生出的 structured page data。
- Context 行为：Agent context 使用 deterministic structured summary，而不是完整 structured data。
- 测试：`tests/node/shared/schemas/**` schema 测试，以及 `tests/dom/page/structured/**` builder/adapter 测试。
- 不预计新增外部依赖。
