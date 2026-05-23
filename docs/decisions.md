# 决策记录

## ADR-001：Local-first，不强制后端

BrowserHelm core 运行在浏览器扩展中。后端服务未来可以作为可选能力，但核心 agent 执行、memory、settings 和 trace 默认 local-first。

## ADR-002：自研 Agent Kernel

BrowserHelm 自己掌控 observe -> decide -> approve -> act -> verify loop。通用 agent SDK 未来可以作为 adapter，而不是早期 runtime 地基。

## ADR-003：A11y-first，不 screenshot-first

初始 observation 优先结构化页面状态、accessibility-like tree、stable refs、forms、console logs 和 network failures。Screenshot/vision tools 后续引入。

## ADR-004：OpenAI Agents SDK 不进入 core

OpenAI Agents SDK 延后到兼容层或 hosted mode 评估。早期 browser runtime 需要精确控制 tools、approval、memory、trace 和 page execution。

## ADR-005：Vercel AI SDK 不进入 core

Vercel AI SDK 更适合 frontend hook + backend route 模式。BrowserHelm 的 no-backend 约束更适合自研 model client 和 agent runtime。
