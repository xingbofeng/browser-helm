# 开源项目调研与对比

本文档对 BrowserHelm 前期调研的 5 个开源项目做完整对比，并明确哪些设计应该吸收，哪些不建议照搬。

调研项目：

- Sarathi AI
- WebBrain
- BrowserBee
- BrowserKing
- onUI

结论先行：

| BrowserHelm 模块 | 主要参考 | 原因 |
|---|---|---|
| Agent Kernel / 最小 loop | Sarathi AI + WebBrain | Sarathi 简洁，WebBrain 成熟 |
| A11y-first page tools | WebBrain | 工具最完整，a11y/ref_id 思路最接近 |
| Tool System | WebBrain + BrowserBee | WebBrain 工具面广，BrowserBee 命名规整且有 memory tools |
| System Prompt | WebBrain | Ask/Act、当前页优先、验证优先、安全边界最完整 |
| Memory / Workflow Replay | BrowserBee + WebBrain | BrowserBee 有 domain workflow memory，WebBrain 有 scratchpad |
| Provider Adapter | BrowserKing | 重点是 Anthropic/OpenAI-compatible 适配思路 |
| Annotation / Context | onUI | 页面标注和 MCP context 工具值得参考 |
| Observability / Trace | WebBrain | trace recorder、conversation/session 持久化更成熟 |
| Multi-agent | 无明显成熟参考 | 5 个项目都不是成熟多 agent 架构 |

---

## 1. 总体对比

| 项目 | 定位 | 形态 | 是否 extension | 是否纯前端 | 成熟度判断 |
|---|---|---|---:|---:|---|
| Sarathi AI | 语音驱动 DOM 浏览器助手 | Chrome extension | 是 | 基本是 | 简洁 MVP，可参考最小 loop |
| WebBrain | 通用浏览器 Agent | Chrome/Firefox extension | 是 | 基本是 | 最成熟，tool/prompt/trace 最值得研究 |
| BrowserBee | Browser automation agent | Chrome extension | 是 | 基本是 | memory/workflow 思路突出 |
| BrowserKing | Claude for Chrome 改造 + provider adapter | Chrome extension | 是 | 是 | 适合研究 provider adapter，不适合研究 clean architecture |
| onUI | UI annotation + MCP context provider | Extension + local MCP | 是 | 否，含本地 MCP server | 不是 agent loop，但 context/annotation 值得参考 |

---

## 2. Loop / Turn / Session / Control / HITL 对比

### 2.1 Sarathi AI

Loop 特征：

- 自写 loop。
- 每轮读取 DOM snapshot。
- 模型返回严格 JSON action。
- 支持一次返回多个 actions。
- 用 `status: continue | completed | failed` 控制停止。
- 用 actionHistory 避免重复动作。

Turn control：

- 以 DOM snapshot + action history 作为 turn input。
- 没有复杂 session 管理。
- 没有强 trace/replay。

HITL：

- 主要通过用户语音/命令驱动。
- 高风险动作只有 prompt 规则约束，没有完整 approval UI。

对 BrowserHelm 的启发：

- v0.1/v0.2 可以参考 Sarathi 的最小 JSON decision loop。
- `completed/failed/continue` 思路可映射为 `bh_agent_finish/bh_agent_fail/tool`。

不建议照搬：

- action schema 太窄。
- 安全靠 prompt，不够产品级。
- 没有可复盘 trace 和 approval flow。

### 2.2 WebBrain

Loop 特征：

- 自写 loop。
- Ask mode / Act mode 分离。
- 支持 OpenAI function calling 形式。
- 兼容多种 fallback tool call parser。
- mutating tool 后有验证倾向。
- `done` tool 明确结束。
- 有 loop detection / repeated tool warning。

Turn control：

- 每个 tab 有 conversation。
- 使用 `chrome.storage.session` 持久化 per-tab messages。
- 有 context management：旧消息摘要、图片剥离、scratchpad pinning。

Session control：

- per-tab session。
- service worker 重启后可恢复对话。
- mode switch 会刷新 system prompt。

HITL：

- `clarify` tool 可询问用户。
- 敏感动作主要通过 system prompt 和 tool policy 约束。
- 不是完整 approval cockpit，但比 Sarathi 成熟。

对 BrowserHelm 的启发：

- Ask/Act mode 很值得参考。
- 当前页优先、observe-first、verify-first 非常适合 BrowserHelm。
- Context trimming + scratchpad pinning 是长任务关键。

不建议照搬：

- 工具太多，早期照搬会范围爆炸。
- fallback parser 很实用但复杂，v0.1 应先用严格 schema。

### 2.3 BrowserBee

Loop 特征：

- 自写 loop。
- Tool 用 LangChain DynamicTool 包装。
- 模型输出 XML-ish tool call。
- 每个任务按 canonical sequence：identify domain -> lookup memory -> apply memory -> observe -> act。

Turn control：

- `ExecutionEngine` 管理 while loop。
- 工具调用格式由正则解析。
- 不依赖 LangChain AgentExecutor。

Session control：

- 有 sidepanel/task state。
- 有 TokenManager 修剪历史。
- memory 独立于当前 session。

HITL：

- tool call 中包含 `requires_approval`。
- 对敏感任务有 approval 意识。

对 BrowserHelm 的启发：

- Memory-first workflow 很值得参考。
- Tool sequence macro 很适合 v1.1。
- `requires_approval` 字段可作为 BrowserHelm policy 的参考，但 BrowserHelm 更适合 runtime 拦截，而不是完全信模型。

不建议照搬：

- XML-ish tool call 不如严格 JSON/Zod 清晰。
- BrowserHelm 不应把 memory replay 直接交给模型自由执行。

### 2.4 BrowserKing

Loop 特征：

- 不是 clean-room agent loop。
- 更像基于 Claude for Chrome 的现成 extension 改造。
- 重点在 provider adapter，把 Anthropic Messages traffic 转 OpenAI-compatible。

Turn/session control：

- 继承打包 extension 行为，源码边界不清晰。
- 不适合作为 BrowserHelm loop 参考。

HITL：

- UI 文案强调高风险与 screenshots。
- 有 skip permissions prompt 变体。

对 BrowserHelm 的启发：

- Provider adapter 和 API translation 值得参考。
- 多 provider registry 可以研究。

不建议照搬：

- loop/tool schema 不干净。
- 打包资产太多，不适合作为架构参考。

### 2.5 onUI

Loop 特征：

- 没有内置 agent loop。
- 它是 annotation/context provider。
- 通过 MCP 暴露页面 annotation 工具给外部 agent。

Turn/session/HITL：

- HITL 体现在用户手动标注页面。
- Agent loop 在外部 MCP client。

对 BrowserHelm 的启发：

- 适合参考“用户标注作为上下文”的模式。
- 后续 BrowserHelm 可以支持用户手动选择元素/标注问题区域。

不建议照搬：

- 它不是 autonomous browser agent。
- 没有页面操作 loop。

---

## 3. Memory 对比

| 项目 | Memory 类型 | 存储 | 是否长期 | 是否可 replay | 对 BrowserHelm 的启发 |
|---|---|---|---:|---:|---|
| Sarathi AI | actionHistory | 内存 + settings storage | 否 | 否 | 只适合短期防重复 |
| WebBrain | conversation、scratchpad、trace | chrome.storage.session + IndexedDB trace | 部分 | 否 | scratchpad pinning 很值得学 |
| BrowserBee | domain workflow memory | IndexedDB | 是 | 是 | v1.1 主要参考对象 |
| BrowserKing | 不清晰，疑似继承会话状态 | chrome storage / 打包 extension | 不明确 | 不明确 | 不作为 memory 参考 |
| onUI | annotation store | local store + MCP | 是 | 不是 replay | 可作为页面上下文 memory substrate |

### BrowserHelm 采纳策略

BrowserHelm memory 分 4 层：

```txt
Scratchpad：当前任务关键事实
Domain Memory：某域名下的偏好和经验
Workflow Memory：可预览、可确认的 tool sequence
User Preference Memory：可选、用户可控
```

参考来源：

- WebBrain -> scratchpad。
- BrowserBee -> domain + task + toolSequence。
- onUI -> annotation/context store。

BrowserHelm 不采纳：

- 静默 replay。
- 把 secrets 写入 memory。
- 不可见、不可删除的 memory。

---

## 4. Tool 列表对比

### 4.1 Sarathi AI tools/actions

Sarathi 不是 function tool schema，而是 JSON action schema：

```txt
navigate
click
type
keypress
scroll
wait
speak
```

辅助能力：

```txt
getDomSnapshot
executeAction
startListening
stopListening
oneShotRecognize
```

适合参考：

- 最小 action set。
- 严格 JSON action。
- DOM snapshot + injected id。

### 4.2 WebBrain tools

WebBrain tool 面最完整：

```txt
get_accessibility_tree
click_ax
type_ax
set_field
read_page
read_pdf
screenshot
get_interactive_elements
click
type_text
press_keys
scroll
navigate
extract_data
wait_for_element
get_selection
execute_js
new_tab
done
full_page_screenshot
clarify
get_shadow_dom
shadow_dom_query
get_frames
iframe_read
iframe_click
iframe_type
fetch_url
research_url
list_downloads
read_downloaded_file
download_resource_from_page
download_files
download_file
upload_file
scratchpad_write
verify_form
download_social_media
solve_captcha
record_tab
stop_recording
```

适合参考：

- `get_accessibility_tree` -> `bh_a11y_snapshot`
- `click_ax` -> `bh_element_click`
- `type_ax` / `set_field` -> `bh_element_type_text` / `bh_element_set_value`
- `verify_form` -> `bh_form_verify`
- `scratchpad_write` -> `bh_pad_append` / `bh_pad_replace`
- iframe/shadow/download/PDF/CDP 思路进入 v1.4。

### 4.3 BrowserBee tools

BrowserBee tool 更像 Playwright 风格：

```txt
browser_navigate
browser_wait_for_navigation
browser_navigate_back
browser_navigate_forward
browser_get_active_tab
browser_navigate_tab
browser_screenshot_tab
browser_click
browser_type
browser_handle_dialog
browser_get_title
browser_snapshot_dom
browser_query
browser_accessible_tree
browser_read_text
browser_screenshot
browser_move_mouse
browser_click_xy
browser_drag
browser_press_key
browser_keyboard_type
browser_tab_list
browser_tab_new
browser_tab_select
browser_tab_close
save_memory
lookup_memories
get_all_memories
delete_memory
clear_all_memories
```

适合参考：

- memory tools。
- tab tools。
- workflow replay。

不建议照搬：

- `browser_` 前缀和项目重名风险。
- BrowserHelm 统一用 `bh_`。

### 4.4 BrowserKing capabilities

可确认/推断能力：

```txt
screenshot
read_page
navigate
click
left_click
right_click
double_click
triple_click
left_click_drag
scroll
scroll_to
type
keypress
execute_javascript
download
open_new_tab
switch_tab
start_recording
replay_workflow
```

适合参考：

- provider adapter。
- screenshot-first 作为反例：BrowserHelm 不以截图为第一观察手段。

### 4.5 onUI MCP tools

```txt
onui_list_pages
onui_get_annotations
onui_get_report
onui_search_annotations
onui_update_annotation_metadata
onui_bulk_update_annotation_metadata
onui_delete_annotation
onui_clear_page_annotations
```

适合参考：

- 页面 annotation 模型。
- report levels：compact / standard / detailed / forensic。
- 未来 BrowserHelm 可以支持用户选择元素并形成 context memory。

---

## 5. Skill / Prompt / Policy 对比

| 项目 | Prompt 成熟度 | 特点 | BrowserHelm 采纳 |
|---|---:|---|---|
| Sarathi | 中 | 严格 JSON、语音纠错、actionHistory 防重复 | JSON decision、短期防重复 |
| WebBrain | 高 | Ask/Act、当前页优先、a11y-first、verify-first、scratchpad、no fake scheduling | Prompt system 主参考 |
| BrowserBee | 中高 | memory-first canonical sequence、approval 字段 | memory-first 但 runtime 控 replay |
| BrowserKing | 低中 | screenshot-first、provider adapter、简单 guidelines | 不作为 prompt 主参考 |
| onUI | 无 agent prompt | MCP tool descriptions | tool description / report format 参考 |

BrowserHelm prompt 模块见 `docs/prompts.md`。

核心采纳：

- WebBrain 的 operating environment。
- WebBrain 的 current page priority。
- WebBrain 的 verify-first。
- BrowserBee 的 lookup memory first。
- Sarathi 的 strict structured output。

核心不采纳：

- screenshot-first。
- prompt-only safety。
- 静默 replay。

---

## 6. Framework / 技术架构对比

| 项目 | Framework / 技术 | Loop 是否自研 | Tool 包装 | UI |
|---|---|---:|---|---|
| Sarathi | Chrome extension JS | 是 | JSON actions | popup/options 简单 UI |
| WebBrain | Chrome/Firefox extension JS | 是 | OpenAI function tool schema | sidepanel/settings/trace UI |
| BrowserBee | Chrome extension TS + Playwright CRX + LangChain DynamicTool | 是 | DynamicTool | sidepanel |
| BrowserKing | Chrome extension packaged assets | 改造继承 | Claude/OpenAI adapter | Claude extension-like UI |
| onUI | Extension + local MCP server TS | 无 | MCP tools | toolbar/annotation UI |

BrowserHelm 技术选择：

```txt
WXT + React + TypeScript + Zod + Dexie + Zustand + self-owned agent kernel
```

理由：

- 比 Sarathi 更工程化。
- 比 WebBrain 更克制地按版本演进。
- 借鉴 BrowserBee memory，但不引入 LangChain AgentExecutor。
- 借鉴 BrowserKing provider adapter，但不继承打包 extension。
- 借鉴 onUI annotation，但 BrowserHelm 自带 agent loop。

---

## 7. 评测 / Eval 对比

| 项目 | Eval 成熟度 | 说明 |
|---|---:|---|
| Sarathi | 低 | 主要靠手工使用 |
| WebBrain | 中 | trace 有利于复盘，但不是完整 benchmark suite |
| BrowserBee | 中 | 有 memory 成功经验，但 eval 体系有限 |
| BrowserKing | 低 | 不适合作 eval 参考 |
| onUI | 低中 | annotation report 可用于人工验收 |

BrowserHelm 规划：

- v0.1 起 trace。
- v1.0 有 trace detail。
- v2.0 做 eval runner、trace replay、benchmark cases、failure taxonomy。

建议指标：

```txt
任务成功率
平均 step 数
tool failure rate
ref stale rate
approval denial rate
memory hit rate
workflow replay success rate
平均 latency
模型成本
```

---

## 8. 可观测性 / Observability 对比

| 项目 | Trace | Debug log | UI 可见性 | 结论 |
|---|---:|---:|---:|---|
| Sarathi | 低 | actionHistory | 低 | 只够 MVP |
| WebBrain | 高 | trace recorder、IndexedDB runs/events | 中高 | 最值得参考 |
| BrowserBee | 中 | token/memory/tracking | 中 | memory 可观测可参考 |
| BrowserKing | 中低 | adapter debug log | 中 | provider adapter debug 可参考 |
| onUI | 中 | annotation store/report | 高 | context 可见性可参考 |

BrowserHelm 设计：

- 每个 run 有 trace。
- 每个 step 有 model decision、tool call、tool result、observation summary。
- 不默认保存完整 DOM / secrets / screenshots。
- UI 中展示 timeline、tool inspector、trace detail。

---

## 9. 多 Agent 协同对比

5 个项目都没有成熟多 agent 协同体系。

| 项目 | 多 agent | 说明 |
|---|---:|---|
| Sarathi | 无 | 单 agent |
| WebBrain | 无成熟多 agent | 有 vision subsystem，但不是多 agent 协同 |
| BrowserBee | 无 | 单 agent + tools |
| BrowserKing | 不清晰 | 继承 Claude extension 行为 |
| onUI | 外部 agent 可使用 MCP tools | onUI 自身不调度多 agent |

BrowserHelm 策略：

- v1.x 不做多 agent。
- v2.0 后可考虑 specialized agents：
  - Page Reader Agent
  - Form Agent
  - Debug Agent
  - Vision Agent
  - Memory Curator Agent
  - Security Reviewer Agent

但早期必须单 agent loop 稳定。

---

## 10. BrowserHelm Adoption Matrix

| 能力 | Sarathi | WebBrain | BrowserBee | BrowserKing | onUI | BrowserHelm 决策 |
|---|---:|---:|---:|---:|---:|---|
| Strict structured output | 高 | 中 | 中 | 低 | 不适用 | 采用，Zod 强校验 |
| A11y-first | 中 | 高 | 中 | 低 | 不适用 | 采用，v0.2 核心 |
| Screenshot-first | 低 | 可选 | 可选 | 高 | 低 | 不采用为默认 |
| Scratchpad | 无 | 高 | 低 | 不清晰 | 无 | 采用，v1.1 |
| Domain workflow memory | 无 | 低 | 高 | 不清晰 | 中 | 采用，v1.1 |
| Trace | 低 | 高 | 中 | 中低 | 中 | 采用，从 v0.1 开始 |
| Approval | 低 | 中 | 中 | 中 | 不适用 | 强化，runtime 拦截 |
| Provider adapter | 低 | 中 | 中 | 高 | 不适用 | 采用自研 ModelClient |
| Annotation context | 无 | 低 | 低 | 低 | 高 | 后续可选 |
| Multi-agent | 无 | 低 | 无 | 不清晰 | 外部 | v2.0 后再考虑 |

---

## 11. 最终建议

BrowserHelm 不应该照搬任何一个项目，而应该组合吸收：

```txt
Sarathi 的最小 DOM action loop
+ WebBrain 的 a11y-first tool/prompt/trace/scratchpad
+ BrowserBee 的 domain workflow memory
+ BrowserKing 的 provider adapter 思路
+ onUI 的 annotation/context 思路
= BrowserHelm local-first browser agent cockpit
```
