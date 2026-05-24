# Structured Page Data Specification

## Purpose

定义 BrowserHelm 将页面 observation 组织为结构化 tab data、确定性摘要和 runtime/trace 数据边界的能力契约。

## Requirements

### Requirement: Structured Page Data 契约

系统 MUST 提供 `StructuredPageData` 契约，将一次页面 observation 组织成 observation、refs、interactive、forms 四类 tab data。

#### Scenario: 从成功 observation 生成 structured data
- **WHEN** v0.2 页面 observation 成功
- **THEN** 系统 MUST 生成包含 `observation`、`refs`、`interactive`、`forms` 四类 tab data 的 structured page data
- **THEN** structured page data MUST 通过对应 tab data 保留页面 URL、title、currentDomain、origin、page state summary、visible text summary 和 ref summaries

#### Scenario: 保持 v0.2 observation 行为
- **WHEN** structured page data 被生成
- **THEN** 系统 MUST NOT 改变既有 v0.2 observation payload contract
- **THEN** 既有 `bh_page_observe` 和 ref map 行为 MUST 保持兼容

### Requirement: 统一 Tab Data 外壳

系统 MUST 使用统一外壳表达每类 tab data，包含 status、summary、count、items、updatedAt、warnings，以及可选 error 和 emptyReason。

#### Scenario: Ready tab data
- **WHEN** 某个 tab 成功产出 item 数据
- **THEN** tab data MUST 使用 `ready` status
- **THEN** tab data MUST 包含确定性 summary、非负 count、items 数组、updatedAt 时间戳和 warnings 数组

#### Scenario: Empty tab data
- **WHEN** 某个 tab 已被检查且没有找到匹配页面数据
- **THEN** tab data MUST 使用 `empty` status
- **THEN** tab data MUST 包含 emptyReason，且 MUST NOT 仅依赖空 items 数组表达空状态

#### Scenario: Unsupported tab data
- **WHEN** 当前版本或页面能力无法产出某类 tab data
- **THEN** tab data MUST 使用 `unsupported` status
- **THEN** tab data MUST 包含确定性 summary，说明该类别当前不可用
- **THEN** tab data MUST NOT 被报告为 `empty`

#### Scenario: Error 或 partial tab data
- **WHEN** 某个 tab 类别失败，但其他类别仍可生成
- **THEN** 失败 tab MUST 报告 `error` 或 `partial` status
- **THEN** 其他可用 tab data MUST 尽可能继续返回
- **THEN** 失败 tab MUST 包含结构化 warning 或 error 信息

### Requirement: Observation 和 Ref Tab Data

系统 MUST 从 v0.2 observation 输出派生 observation 和 refs tab data。

#### Scenario: Observation tab 使用页面元信息
- **WHEN** 从 observation 生成 structured page data
- **THEN** observation tab data MUST 包含页面 URL、title、currentDomain、origin、visible text summary、page state summary、warnings 和确定性 summary

#### Scenario: Refs tab 使用 ref summary
- **WHEN** observation 包含 ref summaries
- **THEN** refs tab data MUST 包含 refId、role、name、tagName、visible，以及可用的 disabled 字段
- **THEN** refs tab count MUST 等于返回的 ref items 数量

#### Scenario: 未找到 refs
- **WHEN** observation 成功但没有 ref summaries
- **THEN** refs tab data MUST 报告 `empty` status
- **THEN** refs tab data MUST 包含说明未检测到 refs 的 emptyReason

### Requirement: 浅层 Interactive Tab Data

系统 MUST 在 v0.3 提供 interactive tab data，但不实现完整 v0.31 interactive discovery。

#### Scenario: 从 ref summary 派生 interactive tab
- **WHEN** observation 包含 v0.2 ref summaries
- **THEN** interactive tab data MAY 从 ref summary 字段浅层派生
- **THEN** 每个 interactive item MUST 保留 refId，以及可用的 role、name、tagName、visible、disabled 状态

#### Scenario: v0.3 不读取完整 interactive 状态
- **WHEN** interactive tab data 被生成
- **THEN** 系统 MUST NOT 要求 checked、selected、editable、keyboard focusability 或 ranking 数据存在
- **THEN** 这些完整状态要求 MUST 保持在 v0.3 范围之外

### Requirement: Forms Tab 边界

系统 MUST 在 v0.3 定义 forms tab data，但不要求完整 v0.32 form field reading。

#### Scenario: 完整 form reader 前 forms tab 为 unsupported
- **WHEN** 完整 form field reading 尚未实现
- **THEN** forms tab data MUST 报告 `unsupported` status
- **THEN** forms tab data MUST NOT 声称页面没有 form fields

#### Scenario: Forms tab contract 始终存在
- **WHEN** structured page data 被生成
- **THEN** forms tab data MUST 存在，即使其 status 为 `unsupported`
- **THEN** forms tab data MUST 使用与其他 tab 相同的 tab data 外壳

### Requirement: 确定性 Structured Page Summary

系统 MUST 使用确定性规则生成 structured page summaries，而不是调用模型。

#### Scenario: Context summary 排除完整数据
- **WHEN** Agent context 从 structured page data 构建
- **THEN** 模型可见上下文 MUST 只包含裁剪后的确定性 summary
- **THEN** 模型可见上下文默认 MUST NOT 包含完整 structured page data items

#### Scenario: Summary 不由模型生成
- **WHEN** structured page data summary 被生成
- **THEN** 系统 MUST NOT 调用 LLM 或 provider API 生成 summary
- **THEN** summary MUST 能从 structured page data 输入中可重复生成

#### Scenario: 完整数据保留给 runtime 和 trace
- **WHEN** structured page data 被生成
- **THEN** 完整 structured page data MUST 可进入 runtime snapshot 或 trace storage
- **THEN** Agent context MUST 只接收确定性 summary 边界

### Requirement: 不新增模型可见 Structured Data Tool

系统 MUST 在 v0.3 将 structured page data 生成保持为内部能力，MUST NOT 新增模型可见的 structured data tool。

#### Scenario: Observation 后内部 adapter 生成
- **WHEN** runtime flow 中 page observation 成功
- **THEN** structured page data MAY 由内部 adapter 生成
- **THEN** 模型 MUST NOT 需要调用新的 `bh_page_structured_data` 工具来获得 v0.3 数据

#### Scenario: Tool surface 保持稳定
- **WHEN** v0.3 structured page data 被实现
- **THEN** 既有模型可见 page observation tools MUST 仍然是主要 observation 入口
- **THEN** 验收不要求新增模型可见 structured data tool
