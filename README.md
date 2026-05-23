# BrowserHelm / 浏览器舵手

![状态](https://img.shields.io/badge/status-planning-blue)
![运行时](https://img.shields.io/badge/runtime-browser_extension-2ea44f)
![架构](https://img.shields.io/badge/architecture-local--first-black)
![Agent](https://img.shields.io/badge/agent-a11y--first-6f42c1)
![后端](https://img.shields.io/badge/backend-none-orange)
![语言](https://img.shields.io/badge/language-TypeScript-3178c6)
![UI](https://img.shields.io/badge/UI-React-61dafb)
![Memory](https://img.shields.io/badge/memory-local--first-0969da)
![Tools](https://img.shields.io/badge/tools-bh__prefix-black)
![License](https://img.shields.io/badge/license-TBD-lightgrey)

**BrowserHelm（浏览器舵手）** 是一个本地优先、a11y-first 的浏览器 Agent。它运行在用户自己的浏览器扩展里，通过结构化页面观察、稳定元素引用、可审批工具执行、本地记忆和可复盘 trace，帮助用户调试页面、填写表单、理解错误、复用工作流，并最终成长为完整的浏览器 Agent 平台。

它不是云浏览器，不是后端自动化服务，也不是把通用 Agent SDK 包一层 UI。BrowserHelm 的核心资产是自己的浏览器 Agent Kernel：观察页面、决定动作、审批风险、执行工具、验证结果、写入 trace、使用 memory，并把每一步清楚地展示给用户。

## 一句话定位

```txt
BrowserHelm = local-first browser agent cockpit + a11y-first page tools + inspectable memory + safe workflow replay.
```

## 核心原则

- **Local-first**：核心 Agent loop、memory、trace、settings、tool execution 默认在本地浏览器扩展内完成。
- **No required backend**：核心产品不需要后端；未来云同步、团队能力、hosted mode 只能是可选增强。
- **A11y-first**：优先使用 accessibility-like tree、stable refs、form snapshots、console/network errors，而不是截图优先。
- **Self-owned Agent Kernel**：不把早期核心 loop 交给 OpenAI Agents SDK、Vercel AI SDK 或 LangChain AgentExecutor。
- **Transparent Cockpit UI**：用户必须看到 Agent 看到了什么、调用了什么工具、为什么失败、哪些动作需要确认。
- **Approval by design**：提交、发送、发布、删除、支付、上传、执行 JS、剪贴板、workflow replay 等高风险动作必须审批。
- **Inspectability**：Memory、trace、workflow、tool result 都要可查看、可删除、可复盘。

## v1.0 产品目标

v1.0 不追求“全能浏览器 Agent”，而是交付第一个可发布产品：**Frontend Debug + Form Agent**。

它要解决：

- 页面为什么报错？
- 接口为什么失败？
- 表单为什么不能提交？
- 哪些必填项缺失？
- 哪个按钮为什么 disabled？
- Agent 填了哪些字段，提交前能不能确认？

v1.0 必须包含：

- Chrome extension side panel。
- BYOK OpenAI-compatible ModelClient。
- 自研 AgentLoop / ToolRegistry / DecisionParser / TraceRecorder。
- A11y snapshot、stable ref_id、click/type/set_field。
- Form list/read/fill/verify/submit-with-approval。
- Console/network/page health debug tools。
- Cockpit UI：chat、timeline、tool inspector、observation panel、form panel、debug panel、approval dialog、settings。

v1.0 明确不包含：

- 长期 memory / workflow replay。
- DevTools CDP response body deep inspector。
- Vision / screenshot-first agent。
- Multi-tab / iframe / shadow DOM 深度工具。
- PDF、download/upload、clipboard。
- Domain adapters。
- OpenAI Agents SDK 或 Vercel AI SDK core integration。

## 技术栈

- Extension framework：WXT。
- UI：React。
- Language：TypeScript。
- Schema：Zod。
- IndexedDB：Dexie.js。
- UI state：Zustand。
- A11y helpers：DOM APIs、`dom-accessibility-api`、`aria-query`。
- Browser APIs：Chrome Extension APIs、Side Panel、Tabs、Scripting、Storage、Downloads、Debugger/CDP。
- Model layer：自研 OpenAI-compatible REST client，支持 BYOK、custom base URL、model config。
- Lint/Type：ESLint flat config、strict TypeScript。

## Roadmap

- `v0.1` Agent Kernel Prototype：纯前端 loop、model client、tool registry、trace。
- `v0.2` A11y Page Tools Prototype：真实页面观察、stable ref、click/type/scroll/nav。
- `v0.3` Cockpit UI Prototype：side panel、timeline、tool inspector、approval、settings。
- `v1.0` Frontend Debug + Form Agent：第一个可发布版本。
- `v1.1` Memory + Workflow Replay：scratchpad、domain memory、workflow replay。
- `v1.2` DevTools/CDP Deep Tools：debugger、network detail、response body、performance。
- `v1.3` Vision/Screenshot Agent：视觉理解、遮挡、布局、坐标 fallback。
- `v1.4` Advanced Browser Tools：tabs、iframe、shadow DOM、files、PDF、clipboard。
- `v1.5` Domain Adapters：GitHub、Gmail、Notion、Linear、Jira、Stripe、Vercel、Supabase。
- `v2.0` Full Browser Agent Platform：eval、trace replay、adapter/workflow ecosystem、optional sync/team。

## 文档入口

- `docs/architecture.md`：完整架构、技术选型、目录结构、运行边界。
- `docs/tools.md`：完整 `bh_` 工具体系与 v1.0/v2.0 tool set。
- `docs/memory.md`：scratchpad、domain memory、workflow memory、replay policy。
- `docs/security.md`：权限、安全、prompt injection、secret masking、approval。
- `docs/research.md`：Sarathi、WebBrain、BrowserBee、BrowserKing、onUI、SDK 取舍。
- `docs/decisions.md`：关键 ADR。
- `docs/roadmap/`：每个版本一个需求文档，使用统一 11 模块模板。
- `docs/specs/`：AgentDecision、Observation、ToolSpec、ToolResult、TraceEvent、Approval、Memory。
- `docs/design/`：只放设计图。
