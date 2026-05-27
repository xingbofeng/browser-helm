# BrowserHelm 上下文

BrowserHelm 是一个 local-first、a11y-first 的浏览器 Agent 扩展。这个词汇表用于统一 roadmap、OpenSpec、implementation notes 和代码讨论中的产品领域语言。

## 领域语言

**Agent Kernel**：
把用户任务和当前上下文转成下一步 Agent 决策的决策循环。
_避免使用_：bot core、model loop

**Terminal Decision**：
不调用浏览器或页面工具、直接结束或暂停一次运行的 Agent 决策。
_避免使用_：finish tool、fail tool、normal browser tool

**Structured Page Data**：
v0.3 的数据契约，用稳定的页面数据类别组织 page observation 输出，供 UI、runtime、trace 和 Agent summary 使用。
_避免使用_：full page parser、form doctor、action executor

**Tab Data**：
面向产品的数据类别，用于 Cockpit panel 和 runtime snapshot。
_避免使用_：browser tab、Chrome tab

**Cockpit UI / 驾驶舱 UI**：
BrowserHelm 在 extension side panel 中提供的用户控制面，用于查看页面数据、Agent 步骤、工具结果、trace、settings 和 approval。
_避免使用_：side panel app、desktop workbench、form doctor UI

**Page Inspector / 页面检查员**：
v1.0 的只读页面诊断产品能力，用于解释页面状态、基础错误信号和下一步建议。
_避免使用_：debug workbench、DevTools clone、page automation

**Long Page Reading / 长页面读取**：
当页面正文或可见文本超过 bounded observation 能承载的范围时，Agent 通过分页读取、正文读取、滚动后重读等工具继续获取上下文的能力。
_避免使用_：full DOM dump、unbounded page scrape

**Iframe Page / iframe 页面**：
由页面中的 iframe 承载的嵌入子页面。Agent 语义和工具命名中统一使用 iframe；底层浏览器 runtime 可以使用 frameId 作为技术标识。
_避免使用_：frame page、embedded page、sub-document

**Viewport Scroll Context / 视口滚动上下文**：
可以读取滚动状态或执行滚动的上下文，可以是顶层页面，也可以是 iframe 页面。滚动属于低风险视口变更，不等同于点击、输入或提交等业务动作。
_避免使用_：frame scroll、page mutation

**Tool-calling User Task Path / 工具调用型用户任务路径**：
用户主动提交的任务必须进入 AgentLoop，由模型基于工具结果迭代决策；不能只基于一次页面 snapshot 摘要直接生成 provider 回答。
_避免使用_：snapshot answer path、provider-only answer

**Form Doctor / 表单医生**：
v1.0 的只读表单诊断产品能力，用于解释字段状态、必填缺失、校验错误和提交按钮不可用原因。
_避免使用_：autofill、form submitter、form executor

**Observation Tab Data**：
记录页面 URL、标题、可见文本摘要和页面状态的 Tab Data 类别。
_避免使用_：raw DOM

**Ref Tab Data**：
记录 stable element references 及其摘要的 Tab Data 类别。
_避免使用_：selector list

**Interactive Tab Data**：
只读识别看起来可点击、可输入、可选择或具有其他交互语义的元素的 Tab Data 类别。
_避免使用_：action readiness、safe action target

**Form Fields Tab Data**：
记录表单字段、只读字段状态、校验状态和提交状态诊断的 Tab Data 类别。
_避免使用_：autofill、submit action

**Action Readiness**：
动作执行前的安全契约，用于判断未来的浏览器动作是否有有效目标和风险状态。
_避免使用_：action execution、clicking、typing

**Empty Tab State**：
表示页面已经检查过，但没有找到对应数据的 Tab Data 状态。
_避免使用_：unsupported、not implemented

**Unsupported Tab State**：
表示当前版本或页面能力暂不支持生成某类数据的 Tab Data 状态。
_避免使用_：empty、no data

**Deterministic Summary**：
由产品规则生成的摘要，不由模型调用生成。
_避免使用_：LLM summary、narrative report

**Run Mode**：
一次 Agent run 的工具可见性边界。面向用户展示时使用中英文双语名称，例如“询问 / Ask”、“调试 / Debug”、“表单 / Form”、“动作准备 / Act”。
_避免使用_：task classifier、mode system、权限模式

**Run Mode Gate**：
按当前 Run Mode 裁剪模型可见工具，并阻止不允许的工具执行的最小门禁。
_避免使用_：ToolSelector、TaskClassifier

**Mode System**：
v1.0 的完整模式系统，包含任务分类、工具选择、权限感知和策略化裁剪。
_避免使用_：Run Mode Gate


**Assisted Form Fill**：
Agent 自动推断字段值并批量填写表单的模式，填写阶段不逐字段确认，安全边界通过跳过敏感/隐藏/禁用字段、填写后 verify 和提交前 approval 卡阻断来实现。
_避免使用_：autofill、form executor

**Fill Plan**：
根据用户任务、页面摘要和当前表单字段快照推断出的单字段填空方案，包含 requestedValue、source、confidence、reason 和 maskedValuePreview。
_避免使用_：form autocomplete、field suggestion

**Form Verify**：
提交前的必做验证步骤，读取 HTML5 validity、required、validationMessage、可见错误文本、submit disabled reason 和实际 DOM 值，返回 pass/fail/warn。
_避免使用_：validation check、form validation

**Submit Approval Card**：
提交前阻断 Agent run 的主屏卡片，展示表单名、字段摘要、skipped 字段、验证状态、风险说明和 masked 字段值；支持 verify failed 时"仍然提交"高风险路径。
_避免使用_：submit dialog、confirm dialog

**Disabled Submit Reason**：
对提交按钮不可用原因的只读诊断结果，置信类型为已确认、推断或无法判断。
_避免使用_：submit blocker、autofill diagnosis

**Confirmed Reason**：
有直接页面证据支撑的 disabled submit reason。
_避免使用_：guess、maybe

**Inferred Reason**：
根据页面状态合理推断、但没有直接原因声明的 disabled submit reason。
_避免使用_：confirmed reason、fact

**Unknown Reason**：
系统知道提交按钮不可用，但无法从只读页面信号判断原因。
_避免使用_：empty reason、unsupported

## 关系

- **Agent Kernel** 产出工具调用或 **Terminal Decision**。
- **Structured Page Data** 包含 **Observation Tab Data**、**Ref Tab Data**、**Interactive Tab Data** 和 **Form Fields Tab Data**。
- **Structured Page Data** 是 v0.3 契约层；完整 interactive discovery 属于 v0.31，完整 form field reading 属于 v0.32，**Action Readiness** 属于 v0.33。
- **Cockpit UI / 驾驶舱 UI** 承载用户可见的 side panel 体验；side panel 是宿主位置，不是产品概念。
- **Page Inspector / 页面检查员** 和 **Form Doctor / 表单医生** 是 v1.0 的首发产品闭环，默认只读诊断，不代表自动填写或提交。
- **Long Page Reading / 长页面读取** 用于弥补 bounded observation 的上下文上限；默认仍通过摘要和分页 chunk 控制模型上下文，不代表无限制读取完整 DOM。
- **Iframe Page / iframe 页面** 是页面级读取对象；iframe 内的具体按钮、输入框等仍属于元素语义，使用 element 工具和 stable ref。
- **Viewport Scroll Context / 视口滚动上下文** 负责页面或 iframe 的滚动状态与滚动动作；不单独引入 frame scroll 语义。
- **Tool-calling User Task Path / 工具调用型用户任务路径** 是用户任务主路径；内部自动观察或 deterministic diagnostic fallback 不能替代用户任务 AgentLoop。
- **Tab Data** 供 **Cockpit UI / 驾驶舱 UI** 和 runtime snapshot 使用；Agent context 只接收从 Tab Data 裁剪出的摘要。
- **Interactive Tab Data** 和 **Form Fields Tab Data** 只负责识别与诊断页面结构，不判断动作是否可以安全执行。
- **Run Mode Gate** 是 v0.31/v0.32 为新增细粒度工具提供的最小工具门禁；完整 **Mode System** 属于 v1.0。
- v1.0 的 **Act / 动作准备** 只表达动作前检查、风险、readiness、policy 和 approval 边界；真实表单填写、verify、submit-with-approval 和提交执行属于 v1.1。
- **Disabled Submit Reason** 可以是 **Confirmed Reason**、**Inferred Reason** 或 **Unknown Reason**。
- **Empty Tab State** 和 **Unsupported Tab State** 必须区分：empty 表示已检查但没有匹配数据，unsupported 表示当前能力边界内不可用。
- **Deterministic Summary** 是 **Structured Page Data** 默认使用的摘要形式。

## 示例对话

> **Dev：**“v0.3 会实现完整表单诊断吗？”
> **Domain expert：**“不会。v0.3 定义 **Structured Page Data** 和 **Tab Data** 边界。完整表单读取属于 v0.32。”

> **Dev：**“forms tab 没有字段，这是 empty 吗？”
> **Domain expert：**“只有页面已经检查过且确实没有表单时才是 **Empty Tab State**。如果 v0.3 还没实现完整表单读取，那是 **Unsupported Tab State**。”

> **Dev：**“如果一个 input 出现在 **Interactive Tab Data** 里，Agent 能直接往里输入吗？”
> **Domain expert：**“还不能。v0.31/v0.32 只负责识别和诊断。动作是否能安全执行属于 v0.33 的 **Action Readiness**。”

> **Dev：**“提交按钮 disabled，是不是一定因为邮箱字段错了？”
> **Domain expert：**“不一定。如果浏览器校验直接给出错误，这是 **Confirmed Reason**；如果只是同时看到 invalid 字段和 disabled submit，那是 **Inferred Reason**；没有线索就是 **Unknown Reason**。”

> **Dev：**“Debug 和 Form 工具是不是会一直暴露给模型？”
> **Domain expert：**“不会。v0.31/v0.32 先用 **Run Mode Gate** 做最小门禁；v1.0 再做完整 **Mode System**。”

> **Dev：**“iframe 里有很多内容，是不是用 element inspect 读？”
> **Domain expert：**“读具体按钮或输入框用 element 工具；读整个 iframe 页面正文、滚动状态和分页内容，用 **Iframe Page / iframe 页面** 工具。”

> **Dev：**“滚 iframe 要不要单独做 frame_scroll？”
> **Domain expert：**“不要。iframe 和顶层页面都属于 **Viewport Scroll Context / 视口滚动上下文**，统一由 viewport 工具处理。”

## 已澄清歧义

- “tab data” 容易被误解成 Chrome 浏览器 tab。已澄清：**Tab Data** 是 Cockpit/product 数据类别，不是浏览器 tab。
- “0.3” 曾同时指 v0.3 family 和具体的 Structured Page Data 版本。已澄清：**Structured Page Data** 是 v0.3；v0.31/v0.32/v0.33 是后续独立版本。
- “empty” 曾同时表示没有数据和未实现。已澄清：**Empty Tab State** 表示已检查但没有匹配数据；**Unsupported Tab State** 表示当前版本或页面能力不支持。
- “interactive” 容易被误解成允许执行动作。已澄清：**Interactive Tab Data** 是只读识别；**Action Readiness** 才判断后续动作是否可以安全执行。
- “submit disabled reason” 容易把推断说成事实。已澄清：disabled submit reason 必须区分 **Confirmed Reason**、**Inferred Reason** 和 **Unknown Reason**。
- “mode” 容易同时指手动门禁和完整智能模式系统。已澄清：**Run Mode Gate** 是当前最小工具门禁；**Mode System** 是 v1.0 的自动分类和策略裁剪。
- “side panel” 容易同时指 Chrome 宿主位置和产品界面。已澄清：产品界面统一称为 **Cockpit UI / 驾驶舱 UI**。
- “frame / iframe” 容易混淆。已澄清：Agent 语义和工具命名使用 **Iframe Page / iframe 页面**；底层 runtime 可以继续使用 frameId 作为技术标识。
