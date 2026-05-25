## ADDED Requirements

### Requirement: Interactive Element 契约

系统 MUST 提供 `InteractiveElement` 契约，用于表达页面中可点击、可输入、可选择或可切换的交互元素。

#### Scenario: 交互元素包含稳定身份和状态
- **WHEN** 系统返回一个 interactive element
- **THEN** 该元素 MUST 包含 `refId`、`tagName`、`visible` 和 `disabled`
- **THEN** 该元素 MUST 尽可能包含 `role` 和 `name`
- **THEN** 该元素 MUST 在状态可读取时包含 `checked` 和 `selected`

#### Scenario: 交互元素保留 ref 边界
- **WHEN** interactive element 从页面元素生成
- **THEN** 系统 MUST 通过 stable ref 绑定该元素
- **THEN** 系统 MUST NOT 只返回 CSS selector 或 XPath 作为元素身份

### Requirement: Interactive Element Discovery

系统 MUST 从 v0.2 ref map、DOM 属性和 a11y 语义中识别交互元素。

#### Scenario: 识别常见原生交互元素
- **WHEN** 页面包含 button、a[href]、input、select、textarea 或 summary
- **THEN** interactive discovery MUST 返回对应元素
- **THEN** 每个返回元素 MUST 带有可复用的 `refId`

#### Scenario: 识别 ARIA 交互元素
- **WHEN** 页面元素通过 ARIA role 表达 button、link、checkbox、radio、switch、textbox、combobox、option 或 tab 等交互语义
- **THEN** interactive discovery MUST 将该元素作为候选交互元素
- **THEN** 系统 MUST 尽可能读取其 accessible name 和状态

#### Scenario: 谨慎识别 tabindex 元素
- **WHEN** 页面元素只有 tabindex 交互信号
- **THEN** interactive discovery MUST 仅在该元素具有 role、name 或明显交互信号时返回该元素
- **THEN** interactive discovery MUST NOT 将所有 tabindex 元素都视为可交互元素

#### Scenario: 没有交互元素
- **WHEN** 页面已被检查且没有可交互元素
- **THEN** interactive tab data MUST 使用 `empty` status
- **THEN** interactive tab data MUST 包含说明未检测到交互元素的 empty reason

### Requirement: Element State Reader

系统 MUST 提供只读 element state reader，用于读取元素可见性、禁用状态、勾选状态和选中状态。

#### Scenario: 读取 disabled 状态
- **WHEN** 交互元素具有原生 disabled 属性或 aria-disabled 为 true
- **THEN** element state reader MUST 将 `disabled` 报告为 true

#### Scenario: 读取 checked 状态
- **WHEN** checkbox、radio、switch 或具有 aria-checked 的元素被读取
- **THEN** element state reader MUST 返回可用的 `checked` 状态

#### Scenario: 读取 selected 状态
- **WHEN** option、tab 或具有 aria-selected 的元素被读取
- **THEN** element state reader MUST 返回可用的 `selected` 状态

#### Scenario: 单个元素状态读取失败
- **WHEN** 某个元素状态无法读取
- **THEN** 系统 MUST 保留其他可读取元素
- **THEN** 系统 MUST 将失败信息写入 warnings

### Requirement: Interactive Tab Data 接入

系统 MUST 将 v0.31 interactive element list 接入 Structured Page Data 的 interactive tab。

#### Scenario: Interactive tab 使用完整交互元素数据
- **WHEN** structured page data 从成功 observation 生成
- **THEN** interactive tab data MUST 使用 `InteractiveElement` items
- **THEN** interactive tab summary MUST 使用确定性规则描述交互元素数量和主要状态

#### Scenario: Interactive tab 局部失败
- **WHEN** 部分交互元素解析失败但仍有可用元素
- **THEN** interactive tab data MUST 使用 `partial` 或 `ready` status
- **THEN** interactive tab data MUST 包含 warnings
- **THEN** interactive tab data MUST NOT 丢弃所有已成功解析的元素

### Requirement: 只读交互元素工具

系统 MUST 提供只读工具以查找交互元素、检查单个元素和读取单个元素状态。

#### Scenario: 查找交互元素
- **WHEN** Agent 或 runtime 调用 `bh_a11y_find_interactive`
- **THEN** 工具 MUST 返回当前页面的 interactive element list
- **THEN** 工具 MUST NOT 修改页面状态

#### Scenario: 检查单个元素
- **WHEN** Agent 或 runtime 调用 `bh_element_inspect` 并传入有效 `refId`
- **THEN** 工具 MUST 返回该元素的 role、name、tagName 和可用状态

#### Scenario: stale ref 错误
- **WHEN** 只读交互元素工具收到过期或不存在的 `refId`
- **THEN** 工具 MUST 返回结构化 `REF_STALE` 错误
- **THEN** 工具 MUST NOT 尝试通过 selector 猜测替代目标

### Requirement: 交互元素排序和筛选支持

系统 MUST 输出足够信息支持 UI 和 Agent 对交互元素进行搜索、筛选和选中详情展示。

#### Scenario: 排序结果稳定
- **WHEN** 页面交互元素被发现
- **THEN** 系统 MUST 使用确定性规则排序结果
- **THEN** 可见且可用的关键控件 MUST 排在不可见或 disabled 元素之前
- **THEN** DOM 顺序 MUST 作为最终兜底排序依据

#### Scenario: 筛选状态可用
- **WHEN** UI 消费 interactive tab data
- **THEN** 每个 item MUST 包含足以筛选 visible、disabled、checked 和 selected 的状态字段

### Requirement: 最小交互元素 UI

系统 MUST 在 side panel 的交互元素 tab 中展示 v0.31 真实数据，但不要求完整 Cockpit UI。

#### Scenario: 展示交互元素列表
- **WHEN** interactive tab data 为 ready 或 partial
- **THEN** side panel MUST 展示交互元素数量和元素列表
- **THEN** 列表 MUST 展示 `refId`、role、name、visible、disabled 以及可用的 checked 或 selected 状态

#### Scenario: 展示交互元素空状态
- **WHEN** interactive tab data 为 empty
- **THEN** side panel MUST 展示 empty reason

#### Scenario: 展示基础选中详情
- **WHEN** 用户选择一个交互元素
- **THEN** side panel MUST 展示该元素的基础详情
- **THEN** side panel MUST NOT 要求实现高级搜索筛选或完整 Cockpit drilldown

### Requirement: v0.31 验收边界

系统 MUST 保持既有 v0.2/v0.3 行为不受影响，并按 roadmap 设计边界验收 v0.31。

#### Scenario: 既有 observation 和 structured data 行为不受影响
- **WHEN** v0.31 interactive elements 被实现
- **THEN** 既有 v0.2 page observation 和 ref map 行为 MUST 保持兼容
- **THEN** 既有 v0.3 Structured Page Data 外壳 MUST 保持兼容

#### Scenario: 改动范围偏离必须说明
- **WHEN** 实际实现必须超出 roadmap 或 proposal 中列出的目录范围
- **THEN** implementation notes 或 PR summary MUST 记录偏离说明和原因

#### Scenario: 设计图验收
- **WHEN** v0.31 side panel 或 roadmap 可视部分被实现
- **THEN** 实现结果 MUST 符合 v0.31 设计图 / 视觉参考中定义的范围和关键视觉要求
- **THEN** 验收记录 MUST 包含截图或浏览器验证说明
