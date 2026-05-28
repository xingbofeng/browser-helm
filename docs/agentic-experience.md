# Agent 工程化的代价：我们怎么把 prompt 规则全挪进了 runtime

> 本文是 BrowserHelm Agent 核心层设计的方法论总结。如果你正在做一个 LLM Agent 项目，正在从"调 prompt"的 demo 阶段往"可控"的产品阶段走，这里的思路也许能帮你少踩几个坑。

把 Agent 核心层从"模型说了算"推倒重建成"runtime 说了算"——这件事说起来容易，做起来才知道每一个 prompt 规则背后都藏着一个必须硬编码的校验。不是加功能，也不是优化 prompt。核心决策链路从这样：

```
用户任务 → 拼 prompt → 模型输出 tool_call → 直接执行 → 再问模型
```

变成了这样：

![Agent 核心循环流程图](diagrams/agent-core-loop.jpg)

模型不再直接驱动执行。它只负责提出决策候选，然后由一层又一层的 parser、validator、augmenter 决定能不能执行、怎么执行。

如果你觉得这看起来像 SQL 查询引擎里的 planner → optimizer → executor 的 pipeline——没错，就是这个思路。Agent 工程化到最后，就是给不可靠的模型输出套上可靠的校验管道。

---

## 为什么 prompt 不够

早期 Agent 实现非常简单，基本上就是一个 while 循环：拼 prompt → 调模型 → 解析 tool_call → 执行 → 把结果塞回上下文 → 继续。

大概一周之内就会撞到这些墙：

1. 模型输出格式不稳定——有时候是 JSON，有时候带了 markdown 的 fence，有时候是裸文本
2. 模型调用了一个根本不在工具列表里的工具名
3. 模型对同一个表单字段反复填、填完又填
4. 用户说"帮我填一下城市"，模型把页面上已有的邮箱和电话也覆盖了
5. 模型把网页内容当成用户指令执行（prompt injection）
6. 表单场景里模型瞎编用户没给过的值——邮箱、密码、手机号
7. 工具执行成功了，模型下一轮还在想"我是不是还要继续"

这些问题，每一个你都可能在 prompt 里加一段规则试图解决。但问题在于：prompt 是**建议**，模型可能忘了、可能忽略、可能被上下文挤到注意力窗口外面。

所以我们把每一条"你不该这么做"的规则，都从 prompt 挪到了 runtime 的代码里。

![Prompt 是建议，Runtime 是法律](diagrams/prompt-vs-runtime.jpg)

核心原则只有一句话：**凡是你在意的约束，都要在 runtime 里硬拦。Prompt 负责引导模型往正确的方向走，Runtime 负责在模型走错的时候兜底。**

---

## 模型输出：把自由文本压成协议

第一件事就是把 Agent 的决策类型从"任意文本"收敛成四种明确的类型：

![AgentDecision 四种收敛类型](diagrams/agent-decision-types.jpg)

每种类型都可以带一个 `taskStateUpdate`，告诉 runtime"我任务做到哪了"。

`DecisionParser` 做了两件事。第一，硬校验——不是合法 JSON 就直接拒绝，schema 不对就拒绝。第二，兼容——有些 provider 的输出习惯不太一样，比如把 `type: "ask"` 当成 `ask_user`，或者用 JSON mode 时在外面包了一层多余的 `tool_call`，或者还在用旧版本的 `bh_form_fill` 而不是 `bh_form_fill_many`。

这两件事合在一起的原则是：**入口宽，出口严**。Parser 允许模型有一些常见的小偏差，但进入 runtime 的对象必须是严格、统一、可审计的。

测试也很有意思——不是测"理想输出"，而是复盘模型真实翻过的车：fenced JSON、wrapped tool_call、旧版 schema、多 action envelope、非法 JSON……这些才是 Parser 真正的价值所在。Parser 的工作不是解析正确输出，是拦住错误输出。

---

## 重复填表和覆盖已有值：不是 prompt 问题，是状态问题

这两个问题折磨了我们最久。

浏览器 Agent 有一个非常容易出现的循环：观察页面 → 看到表单 → 填 name/email → 工具返回成功 → 下一轮又看到表单 → 再填 → 再填。模型天然"看到表单就想填"，单靠 prompt 很难彻底阻止。

我们的解法是两层防御。第一层，从 trace 里提取最近 8 个工具动作，记录工具名、成功与否、涉及了哪些字段 ref。第二层，`DecisionValidator` 比对新决策和最近动作，如果发现"上一次填表单已经成功了，这一轮又在填同样的字段"，直接返回 `repeated_form_fill`，阻断执行。

覆盖已有值的问题更现实。用户说"帮我填一下城市"，但页面上的邮箱和电话已经有内容了。模型可能错误地把所有字段都重填一遍。

这里 `DecisionValidator` 和 `form-fill-augmenter` 两处都在检查：如果字段已经有值、且用户没有显式说要替换，就不允许覆盖。例外只有 checkbox opt-out（用户说不订阅，自动取消勾选营销选项）和 select 选了同一个值（没变）。

一个重要的设计决策：**已有值不是普通文本，它是用户状态。Agent 不能默认覆盖用户状态。** 这类规则必须写成 runtime validator，因为模型一定会忘。

---

## 表单 Agent 的安全底线：不编值、不碰敏感字段

这是整个改版里最核心的一条安全规则：

> 表单填写只能使用用户明确给过的值。

用户说"帮我注册一个账号"，模型不能自己编邮箱、密码、手机号——它应该返回 `ask_user`。但用户说"搜索美国"，模型可以把 `美国` 或者 select 里 alias 到 `USA` 的值填进去，因为这个值确实是用户给的。

`form-fill-augmenter` 的 runtime validator 会逐个检查：字段在不在当前 observation 里、值是不是来自用户任务、字段是否 sensitive / disabled / readonly / hidden / file 类型、是否已经有值。

这些规则长这样：

```
不能编值
不能覆盖已有值
不能填 password / otp / sensitive
不能填 hidden / file / disabled / readonly
不能跨 frame 混填
提交必须 approval
```

通用 LLM 记不住这些。这些是业务语义，必须写在 runtime 里。

另外 `form-fill-augmenter` 不止是 validator。它还会**增强**模型决策。用户说"不订阅 / 不接收营销邮件"，页面上有已勾选的 newsletter checkbox，但模型没显式填它——runtime 会自动把这个 opt-out 字段加进去，值设为 `false`。

这里有个边界需要注意：只能补全低歧义、可解释的意图。自动取消营销 checkbox 是合理的；"帮我注册账号"时自动生成密码就是不合理的。

---

## 出错怎么修：一次，且要准

`ModelDecisionError` 被设计成带 `kind` 的判别式，而不是靠 message 字符串匹配。它区分了：

```
existing_value_overwrite
tool_not_found
repeated_form_fill
repeated_form_verify
parse_failure
```

然后 `MAX_REPAIR_ATTEMPTS = 1`。解析或校验失败后，只 repair 一次。再失败就直接 fail 或保守 finish。

Repair prompt 的设计也很克制：

- 不会重新列工具列表
- 不会暴露 raw model output
- 不会放松 mode / risk / approval 规则
- 针对"覆盖已有值"，明确说"不能调用工具，只能 finish 或 ask_user"
- 针对"重复填表"，说"不要重复 fill，只能 finish 或 verify"

对比一下坏的 repair prompt："请重新思考用户任务，并选择最佳下一步。"——这个会让模型重新发散，可能产生全新的错误。

Repair 的核心经验：**Repair prompt 是定向纠错指令，不是第二次普通 prompt。越窄越好，次数越少越好。** 浏览器场景里，重复动作会改变真实页面，越修越错是致命的。

---

## 结构化状态：别把 TaskState 塞进聊天历史

很多 Agent 失败不是因为模型不会推理，而是因为它没有稳定的任务状态。每一轮都重新看页面，重新猜"我是不是还要继续"。

我们在 `AgentDecision` 里加入了 `taskStateUpdate`：

```ts
{
  goal,
  completed,
  remaining,
  filledFieldRefs,
  verifiedFieldRefs,
  runtimeCompleted,
  recommendedNextDecision
}
```

模型每一轮都要更新这个状态。同时 runtime 也会在工具执行成功后写入自己的事实——比如表单填完之后，runtime 把 `recommendedNextDecision` 设为 `finish`，告诉模型"你已经填完了，如果没有要求提交，就别再填了，结束吧"。

特别重要的一点：**runtime facts 的优先级高于模型自述**。代码里 `runtimeFactsOverrideModelNotes` 设为 `true`。模型可能对自己的进度有错觉，但 runtime 记录的是实际发生的事实。

---

## 流式输出不是 UI 功能

最后一件事：streaming。这次把 streaming 完全纳入 agent loop，而不是让 UI 自己临时处理。

`requestModelDecision` 优先尝试 `streamComplete`，记录 stream started、delta charCount、stream finished。如果 streaming 失败，记录 fallback started，再走非流式 complete。同时设置了模型请求超时，用 AbortController 中断。

stream delta 的原始内容不写入 trace，只记录 charCount。最终 preview 也经过脱敏。

**流式输出是 Agent runtime 的状态事件，不是 UI 装饰。它要能取消、能 fallback、能 trace、能脱敏。**

---

## 核心循环模板

把这次改版抽象成一个循环模板——如果你在做类似的项目，可以直接参考这个结构：

![Agent 核心循环模板](diagrams/core-loop-template.jpg)

关键特征：一次观察、一次决策、一次工具、一次状态更新。不要让模型一次规划多个动作——浏览器页面在你执行第一步的同时就可能变了。

---

## 这次改版真正改变的认知

不是代码变多了。是职责分工变了。

```
以前：
模型 = 大脑
工具 = 手
代码 = 胶水

现在：
Runtime = 法律 + 状态机
模型 = 决策候选生成器
工具 = 受控执行器
Trace = 可审计记忆
Validator = 安全边界
Prompt = 引导，不是边界
```

做 Agent 产品化最大的错觉是"只要模型够聪明就行了"。不是的。Gemini、GPT、Claude 都很聪明，但它们在浏览器场景里照样会幻觉工具名、重复填表、覆盖用户输入、把网页文本当指令。

**一个可靠的 Agent，不是让模型更聪明，是让模型即使不聪明、不稳定、偶尔犯错，也不会把系统带偏。**

BrowserHelm 这次核心层大改，做的就是这么一件事：解析不可信输出、校验决策、阻止重复动作、保护已有值、限制表单值来源、引入结构化 task state、把 trace 变成短期记忆、把 repair 限制成一次性窄纠错。

如果你也在做类似的事，希望能帮你少走些弯路。

---

## 附：关键设计决策速查

| 规则 | Prompt 层 | Runtime 层 |
|------|-----------|------------|
| 只能调用可用工具 | system prompt 提醒 | `validateModelDecision` 检查 tool set |
| 不要重复填表 | system prompt + recentActions | `repeatedToolDecisionError` 阻断 |
| 只能填用户显式值 | system prompt 提醒 | `validateRuntimeToolDecision` 阻断 |
| 不要覆盖已有值 | system prompt + guidance | `existingValueDecisionError` 阻断 |
| 输出必须 JSON | system prompt | `DecisionParser` + repair |

| 你怕什么 | 在哪里硬拦 |
|----------|-----------|
| 不要提交 | Approval policy |
| 不要重复动作 | Recent action validator |
| 不要填敏感值 | Runtime form validator |
| 不要覆盖已有值 | Existing value guard |
| 不要调用不存在的工具 | Tool contract validator |
| 不要用页面文本当指令 | Prompt + policy + redaction |
