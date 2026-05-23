# 调研

BrowserHelm 参考了多个 browser-agent 与 browser-context 项目。

## 已调研项目

- Sarathi AI：DOM-only 语音/浏览器自动化，使用严格 JSON actions。
- WebBrain：成熟 extension agent，工具面很广，a11y-first prompt、scratchpad、traces 和 debug utilities 值得参考。
- BrowserBee：Chrome extension，使用 LangChain DynamicTool 包装，并实现 domain workflow memory。
- BrowserKing：基于 Claude for Chrome 改造的 provider adapter，偏 screenshot-first 指导。
- onUI：extension + MCP annotation provider，更像页面上下文工具，而不是 agent loop。

## 关键结论

- Agent loop 应该自研和可控。
- A11y refs 比 raw selector 和 coordinates 更稳定。
- Tool result contract 和 tool name 一样重要。
- Memory replay 必须有用户可见确认。
- Trace 和 UI 透明度是用户信任的关键。
- Vision 很重要，但不应该作为初始地基。

## SDK 决策

OpenAI Agents SDK 和 Vercel AI SDK 都有价值，但 BrowserHelm 早期 core 必须自己掌控 browser-specific loop、approval、trace、memory 和 page execution。
