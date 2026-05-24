# Form Fields Specification

## Purpose

定义 BrowserHelm 只读发现表单字段、解析字段状态、保护敏感值、诊断 submit 状态和暴露表单工具的能力契约。

## Requirements

### Requirement: Form Field Snapshot 契约

系统 MUST 提供 `FormFieldSnapshot` 契约，用于表达表单字段身份、字段状态、校验状态和敏感值策略。

#### Scenario: 字段快照包含稳定身份和字段信息
- **WHEN** 系统返回一个 form field snapshot
- **THEN** 该字段 MUST 包含 `refId`、`type`、`required`、`disabled`、`sensitive` 和 `valuePreview`
- **THEN** 该字段 MUST 尽可能包含 `label` 和 `name`

#### Scenario: 字段快照绑定 stable ref
- **WHEN** 表单字段从页面读取
- **THEN** 系统 MUST 通过 stable ref 绑定字段
- **THEN** 系统 MUST NOT 只返回 CSS selector 或 XPath 作为字段身份

### Requirement: Form Discovery

系统 MUST 基于 v0.31 interactive elements、ref map 和 DOM form 结构发现表单、字段和提交按钮。

#### Scenario: 发现原生表单字段
- **WHEN** 页面包含 input、select、textarea 或 button[type=submit]
- **THEN** form discovery MUST 返回对应字段和提交按钮关联信息

#### Scenario: 没有 form 标签但存在字段
- **WHEN** 页面没有原生 form 标签但存在可识别字段
- **THEN** form discovery MUST 返回字段快照
- **THEN** forms tab data MUST NOT 因缺少 form 标签而返回 `empty`

#### Scenario: 发现分离式提交按钮
- **WHEN** 提交按钮通过 form 属性或可推断的页面结构关联到表单
- **THEN** form discovery MUST 尽可能记录该 submit button 与表单字段的关联

#### Scenario: 没有表单字段
- **WHEN** 页面已被检查且没有检测到表单字段
- **THEN** forms tab data MUST 使用 `empty` status
- **THEN** forms tab data MUST 包含说明当前页面未检测到表单字段的 empty reason

### Requirement: Label Resolver

系统 MUST 为表单字段解析可读 label，并在无法解析时保留字段快照。

#### Scenario: 显式 label 优先
- **WHEN** 字段存在 label[for] 或父级 label
- **THEN** label resolver MUST 使用显式 label 文本作为字段 label

#### Scenario: ARIA label 作为 fallback
- **WHEN** 字段没有显式 label 但存在 aria-label 或 aria-labelledby
- **THEN** label resolver MUST 使用 ARIA 来源生成字段 label

#### Scenario: placeholder 和 name 作为 fallback
- **WHEN** 字段没有显式 label 或 ARIA label
- **THEN** label resolver MUST 尽可能使用 placeholder 或 name 生成字段 label

#### Scenario: id 作为最后 fallback
- **WHEN** 字段没有显式 label、ARIA label、placeholder 或 name
- **THEN** label resolver MUST 尽可能使用 id 生成字段 label

#### Scenario: label 解析失败
- **WHEN** 某个字段 label 无法解析
- **THEN** 系统 MUST 保留该字段快照
- **THEN** 系统 MUST 将 label 缺失或失败信息写入 warnings

### Requirement: 字段状态和校验读取

系统 MUST 读取字段 required、disabled、value preview、validationMessage 和 aria-invalid 状态。

#### Scenario: 读取必填和禁用状态
- **WHEN** 字段具有 required、aria-required、disabled 或 aria-disabled 状态
- **THEN** form reader MUST 在字段快照中表达对应 required 和 disabled 状态

#### Scenario: 读取浏览器校验信息
- **WHEN** 字段存在 validationMessage 或 validity 失败状态
- **THEN** validation reader MUST 在字段快照或 warnings 中表达该校验状态

#### Scenario: 读取 aria-invalid
- **WHEN** 字段具有 aria-invalid 属性
- **THEN** validation reader MUST 在字段快照中表达 aria-invalid 状态

#### Scenario: 字段级读取失败
- **WHEN** 某个字段状态读取失败
- **THEN** 系统 MUST 保留其他字段快照
- **THEN** 系统 MUST 将失败信息写入 warnings

### Requirement: 敏感字段 Mask

系统 MUST 默认 mask 敏感字段值，且不得将敏感明文写入 UI、trace、runtime snapshot 或 Agent summary。

#### Scenario: password 字段被 mask
- **WHEN** 字段 type 为 password
- **THEN** 字段快照 MUST 将 `sensitive` 标记为 true
- **THEN** `valuePreview` MUST 为 mask 后的预览

#### Scenario: token 或 secret 字段被 mask
- **WHEN** 字段 label、name、autocomplete 或 type 表达 token、secret、api key、otp 等敏感语义
- **THEN** 字段快照 MUST 将 `sensitive` 标记为 true
- **THEN** `valuePreview` MUST NOT 包含原始明文值

#### Scenario: 非敏感字段使用安全预览
- **WHEN** 字段不属于敏感字段
- **THEN** `valuePreview` MUST 使用长度受限的预览
- **THEN** `valuePreview` MUST NOT 绕过 summary 裁剪规则进入 Agent context

#### Scenario: 普通文本预览长度受限
- **WHEN** 普通 text、email、search、tel 或 url 字段生成 value preview
- **THEN** `valuePreview` MUST 限制在最多 32 个字符

#### Scenario: textarea 预览长度受限
- **WHEN** textarea 字段生成 value preview
- **THEN** `valuePreview` MUST 限制在最多 80 个字符

#### Scenario: 选择类字段使用状态预览
- **WHEN** checkbox、radio 或 select 字段生成 value preview
- **THEN** `valuePreview` MUST 表达选中状态或选中项
- **THEN** `valuePreview` MUST NOT 返回大段页面内容

### Requirement: Submit 状态诊断

系统 MUST 只读诊断 submit button 状态和 disabled submit 的可能原因，并区分 `confirmed`、`inferred` 和 `unknown`。

#### Scenario: 关联 submit button
- **WHEN** 表单存在可关联的 submit button
- **THEN** form snapshot MUST 包含 submit button 的 `refId` 和 disabled 状态

#### Scenario: 推断 disabled submit 原因
- **WHEN** submit button 为 disabled
- **THEN** 系统 MUST 根据 required empty、validation error、aria-invalid 或 disabled 字段等只读信号返回 disabled submit reason
- **THEN** disabled submit reason MUST 包含 `kind`，取值为 `confirmed`、`inferred` 或 `unknown`

#### Scenario: 已确认原因
- **WHEN** disabled submit reason 有直接页面证据支撑
- **THEN** disabled submit reason MUST 使用 `confirmed`
- **THEN** disabled submit reason MUST 包含可读 message 和可选 field ref

#### Scenario: 无法判断 disabled submit 原因
- **WHEN** submit button 为 disabled 但系统无法从只读信号判断原因
- **THEN** 系统 MUST 返回 `unknown` disabled submit reason 和明确的无法判断说明
- **THEN** 系统 MUST NOT 通过填写字段或提交表单来推断原因

#### Scenario: 推断原因不得伪装为事实
- **WHEN** 系统只能根据字段状态和 disabled submit 的组合合理推断原因
- **THEN** disabled submit reason MUST 使用 `inferred`
- **THEN** 系统 MUST NOT 将该原因报告为 `confirmed`

### Requirement: Forms Tab Data 接入

系统 MUST 将 v0.32 form field snapshot 接入 Structured Page Data 的 forms tab。

#### Scenario: Forms tab 使用字段快照
- **WHEN** structured page data 从成功 observation 生成且页面包含表单字段
- **THEN** forms tab data MUST 使用 `FormFieldSnapshot` items
- **THEN** forms tab summary MUST 使用确定性规则描述字段数量、必填数量、校验错误数量和 submit 状态

#### Scenario: Forms tab 从 unsupported 升级
- **WHEN** v0.32 form reader 可用
- **THEN** forms tab data MUST NOT 因版本未实现而返回 `unsupported`
- **THEN** forms tab data MUST 使用 `ready`、`empty`、`partial` 或 `error` 表达实际读取结果

#### Scenario: Forms tab 局部失败
- **WHEN** 部分字段读取失败但仍有可用字段
- **THEN** forms tab data MUST 使用 `partial` 或 `ready` status
- **THEN** forms tab data MUST 包含 warnings
- **THEN** forms tab data MUST NOT 丢弃所有已成功读取的字段

#### Scenario: Submit button 未找到
- **WHEN** 字段读取成功但系统无法找到或关联 submit button
- **THEN** forms tab data MUST 使用 `partial` status
- **THEN** forms tab data MUST 包含说明未找到或无法关联 submit button 的 warning

### Requirement: 最小表单字段 UI

系统 MUST 在 side panel 的表单字段 tab 中展示 v0.32 真实数据，但不要求完整 Cockpit UI。

#### Scenario: 展示表单字段列表
- **WHEN** forms tab data 为 ready 或 partial
- **THEN** side panel MUST 展示字段数量、必填数量、校验错误数量和 submit 状态摘要
- **THEN** 字段列表 MUST 展示 `refId`、label、type、required、valuePreview 和 validation 状态

#### Scenario: 展示 disabled submit reason 置信类型
- **WHEN** forms tab data 包含 disabled submit reason
- **THEN** side panel MUST 使用中文展示 `confirmed`、`inferred` 或 `unknown`
- **THEN** 对应中文 MUST 为“已确认”、“推断”或“无法判断”

#### Scenario: 展示表单字段空状态
- **WHEN** forms tab data 为 empty
- **THEN** side panel MUST 展示 empty reason

### Requirement: 只读表单工具

系统 MUST 提供只读工具以列出表单、检查表单、读取字段、查找缺失必填、查找校验错误和推断 disabled submit 原因。

#### Scenario: 读取表单字段
- **WHEN** Agent 或 runtime 调用 `bh_form_read_fields`
- **THEN** 工具 MUST 返回当前页面的 form field snapshots
- **THEN** 工具 MUST NOT 修改页面状态

#### Scenario: 查找缺失必填字段
- **WHEN** Agent 或 runtime 调用 `bh_form_find_missing_required`
- **THEN** 工具 MUST 返回 required 且 value preview 表达为空的字段列表

#### Scenario: 查找校验错误
- **WHEN** Agent 或 runtime 调用 `bh_form_find_validation_errors`
- **THEN** 工具 MUST 返回存在 validationMessage、validity 失败或 aria-invalid 的字段列表

#### Scenario: 推断 disabled submit 原因工具
- **WHEN** Agent 或 runtime 调用 `bh_form_find_disabled_submit_reason`
- **THEN** 工具 MUST 返回 disabled submit button 的 `confirmed`、`inferred` 或 `unknown` 原因

#### Scenario: stale ref 错误
- **WHEN** 只读表单工具收到过期或不存在的 `refId`
- **THEN** 工具 MUST 返回结构化 `REF_STALE` 错误
- **THEN** 工具 MUST NOT 尝试通过 selector 猜测替代目标

### Requirement: v0.32 验收边界

系统 MUST 保持既有 v0.2/v0.31 行为不受影响，并按 roadmap 设计边界验收 v0.32。

#### Scenario: 既有 observation、ref 和 interactive 行为不受影响
- **WHEN** v0.32 form fields 被实现
- **THEN** 既有 v0.2 page observation 和 ref map 行为 MUST 保持兼容
- **THEN** 既有 v0.31 interactive elements 行为 MUST 保持兼容

#### Scenario: 改动范围偏离必须说明
- **WHEN** 实际实现必须超出 roadmap 或 proposal 中列出的目录范围
- **THEN** implementation notes 或 PR summary MUST 记录偏离说明和原因

#### Scenario: 设计图验收
- **WHEN** v0.32 side panel 或 roadmap 可视部分被实现
- **THEN** 实现结果 MUST 符合 v0.32 设计图 / 视觉参考中定义的范围和关键视觉要求
- **THEN** 验收记录 MUST 包含截图或浏览器验证说明
