## Context

v1.0.1 之前，BrowserHelm side panel 的用户任务主要由 runtime 先执行一次 `bh_page_observe`，再把裁剪后的 snapshot 摘要交给 provider 生成回答。这对短页面和基础诊断足够，但面对长页面、lazy-load、iframe 内容和需要继续读取的任务时，Agent 容易只基于第一页摘要回答。

v1.0.2 的设计目标是补齐 v1.0 必须工具，并把用户任务接入真实 AgentLoop / tool-calling 路径。页面读取能力分为三层：observe 快速摘要和 refs，read 按需读取正文/可见文本/iframe 文档，viewport 获取滚动状态和执行低风险滚动。

## Goals / Non-Goals

**Goals:**

- 支持 cursor 分页读取顶层页面可见文本和 article-like 主内容。
- 支持列出 iframe、读取指定 iframe 内容和 iframe 内 viewport/scroll 状态。
- 支持统一 viewport scroll context：顶层页面和 iframe 都通过 `bh_viewport_scroll` 处理。
- 补齐 v1.0 required tools：element inspect/focus/click/type、nav、debug、policy。
- 用户任务进入真实 AgentLoop tool-calling 路径，而不是只基于一次 snapshot provider answer。
- Provider streaming 与 AgentLoop 兼容：工具决策阶段使用结构化 JSON，最终回答阶段可 streaming。
- 保持上下文安全：完整文本和 raw data 不无界进入模型上下文。

**Non-Goals:**

- 不做自动填写、自动提交或 submit-with-approval。
- 不新增 `bh_iframe_scroll`，iframe 滚动统一由 viewport 工具承担。
- 不做 screenshot-first、vision full page capture、CDP DOM snapshot 或 response body deep inspector。
- 不做 PDF、下载文件、shadow DOM deep reader、上传、长期 memory、workflow replay 或 sub-agent。
- 不保留 `bh_iframe_click` / `bh_iframe_type` deprecated 兼容工具。

## Decisions

### 1. 读取能力分层为 observe / read / viewport

`bh_page_observe` 继续负责 bounded observation 和 refs；`bh_page_read_visible_text` / `bh_page_read_article` 负责按需读取文本；`bh_viewport_get_info` / `bh_viewport_scroll` 负责读取和改变 viewport。这样避免把观察工具扩成无界页面 dump。

### 2. iframe 使用文档读取语义，元素动作走 stable ref

`bh_iframe_list` 和 `bh_iframe_read` 读取 iframe 文档。iframe 内 click/type 不再有独立 iframe tools，而是由 iframe-aware stable ref + `bh_element_click` / `bh_element_type_text` 处理，减少工具面重复。

### 3. Scroll 是低风险 viewport mutation

`bh_viewport_scroll` 标记为 low risk，结果必须 `changedPage: true`、`requiresObserve: true`。滚动后 Agent 必须 wait/observe/read，而不是继续相信旧 snapshot。

### 4. 用户任务进入 AgentLoop

用户提交的任务进入真实 AgentLoop tool-calling phase，模型可根据 warnings、hasMore、cursor、iframe scroll 状态继续调用工具。最终自然语言回答可以使用 streaming provider；工具决策 JSON 不要求 streaming。

### 5. RuntimeDiagnosticModelClient 只保留内部 fallback

内部 diagnostic fallback 可以保留，但不能作为用户任务主路径，也不能在产品 UI 中暴露为真实模型名称。用户任务必须走 AgentLoop/tool-calling。

## Risks / Trade-offs

- [Risk] 长页面读取可能向模型注入过多页面文本 → Mitigation：cursor/maxChars 分页，ContextCompactor 只注入 summary/chunk。
- [Risk] 滚动导致页面 lazy-load 或结构变化 → Mitigation：scroll 结果要求 re-observe/read，并记录 before/after。
- [Risk] 跨域 iframe 无法读取 DOM → Mitigation：返回结构化 limitation，不伪造内容。
- [Risk] AgentLoop + streaming 边界复杂 → Mitigation：拆成 tool-calling phase 和 answer phase，分别测试。
- [Risk] 工具面增加导致 mode 暴露过宽 → Mitigation：ToolSelector / Run Mode Gate 按 mode/risk/permission 裁剪。
