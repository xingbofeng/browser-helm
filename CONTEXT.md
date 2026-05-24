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
一次 Agent run 的工具可见性边界。
_避免使用_：task classifier、mode system

**Run Mode Gate**：
按当前 Run Mode 裁剪模型可见工具，并阻止不允许的工具执行的最小门禁。
_避免使用_：ToolSelector、TaskClassifier

**Mode System**：
v1.0 的完整模式系统，包含任务分类、工具选择、权限感知和策略化裁剪。
_避免使用_：Run Mode Gate

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
- **Tab Data** 供 Cockpit UI 和 runtime snapshot 使用；Agent context 只接收从 Tab Data 裁剪出的摘要。
- **Interactive Tab Data** 和 **Form Fields Tab Data** 只负责识别与诊断页面结构，不判断动作是否可以安全执行。
- **Run Mode Gate** 是 v0.31/v0.32 为新增细粒度工具提供的最小工具门禁；完整 **Mode System** 属于 v1.0。
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

## 已澄清歧义

- “tab data” 容易被误解成 Chrome 浏览器 tab。已澄清：**Tab Data** 是 Cockpit/product 数据类别，不是浏览器 tab。
- “0.3” 曾同时指 v0.3 family 和具体的 Structured Page Data 版本。已澄清：**Structured Page Data** 是 v0.3；v0.31/v0.32/v0.33 是后续独立版本。
- “empty” 曾同时表示没有数据和未实现。已澄清：**Empty Tab State** 表示已检查但没有匹配数据；**Unsupported Tab State** 表示当前版本或页面能力不支持。
- “interactive” 容易被误解成允许执行动作。已澄清：**Interactive Tab Data** 是只读识别；**Action Readiness** 才判断后续动作是否可以安全执行。
- “submit disabled reason” 容易把推断说成事实。已澄清：disabled submit reason 必须区分 **Confirmed Reason**、**Inferred Reason** 和 **Unknown Reason**。
- “mode” 容易同时指手动门禁和完整智能模式系统。已澄清：**Run Mode Gate** 是当前最小工具门禁；**Mode System** 是 v1.0 的自动分类和策略裁剪。
