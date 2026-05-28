## Why

v1.0.1 已经把 BrowserHelm 产品化为单 Agent side panel 并接入真实 provider streaming，但用户任务仍需要补齐长页面、iframe 和真实 tool-calling AgentLoop 的读取闭环。v1.0.2 追补记录已经完成的 v1.0 必须工具、长页面 / iframe 读取和用户任务 AgentLoop tooling。

## What Changes

- 新增长页面读取能力：分页读取可见文本、优先读取 article/main 正文、等待页面稳定，并在截断时引导 Agent 继续读取。
- 新增 viewport 读取和滚动能力：读取顶层页面或 iframe viewport 信息，执行低风险滚动并要求后续重新 observe/read。
- 统一 iframe 读取语义：新增 `bh_iframe_list` 和 `bh_iframe_read`，使用 iframeId 表达 Agent 语义，读取 summary / visible text / article-like content 和 iframe scroll 状态。
- 补齐 v1.0 必须工具缺口：element inspect/focus/click/type、nav open/reload/back/forward、debug console/network/explain、policy mask secrets。
- 将 iframe 内元素动作统一到 iframe-aware stable ref + `bh_element_click` / `bh_element_type_text`，不保留 `bh_iframe_click` / `bh_iframe_type` 兼容工具。
- 将 side panel 用户任务从一次 snapshot provider answer 升级为 AgentLoop tool-calling 路径，使模型可根据工具结果继续读取、滚动、等待稳定和读取 iframe。
- 保持 ContextCompactor 边界：完整文本、raw DOM、ToolResult data 进入 trace/storage；模型上下文只接收裁剪 summary/chunk。
- 更新工具清单、content RPC、runtime messages、system prompt、trace、tests 和 E2E fixtures。
- 明确范围边界：v1.0.2 不做自动填表、自动提交、submit-with-approval、文件上传、CDP response body deep inspector、screenshot-first、长期 memory、workflow replay 或 sub-agent。

## Capabilities

### New Capabilities

- `page-reading`: 定义长页面 visible text / article 读取、cursor 分页、hasMore 和 truncation next hints。
- `iframe-reading`: 定义 iframe list/read、iframeId、跨域 limitation、iframe 内文本/正文读取和 scroll 状态。
- `viewport-scroll-context`: 定义顶层页面和 iframe 的 viewport info、低风险滚动、changedPage/requiresObserve 和等待稳定。
- `agent-loop-tooling`: 定义用户任务进入真实 AgentLoop tool-calling 路径，以及工具调用阶段与最终 streaming answer 阶段的边界。

### Modified Capabilities

- `page-observation`: 增加 truncation warnings、nextHints、长页面读取入口和观察后继续读取规则。
- `agent-kernel`: 增加用户任务 tool-calling 主路径、最终回答 streaming 边界和 internal diagnostic fallback 边界。
- `run-mode-gate`: 扩展 Ask/Debug/Form/Act 对 page read、iframe read、viewport scroll、element/nav/debug/policy 工具的可见性和风险边界。
- `action-readiness`: 扩展 iframe-aware element click/type、viewport scroll changedPage/requiresObserve 和 low-risk mutation 语义。
- `tool-documentation`: 补齐 v1.0.2 新增工具的 README、ToolSpec metadata 和 TSDoc/JSDoc 维护说明。

## Impact

- 影响 `src/tools/page/**`、`src/tools/iframe/**`、`src/tools/viewport/**`、`src/tools/element/**`、`src/tools/nav/**`、`src/tools/debug/**`、`src/tools/policy/**`。
- 影响 `src/page/**`：新增/扩展 readable text、article extraction、iframe strategy、viewport scroll context、wait until stable、iframe-aware ref resolving。
- 影响 `src/agent/**`：用户任务接入 AgentLoop tool-calling，调整 context compaction、prompt、tool selection 和 final answer。
- 影响 `src/runtime/**` 与 `src/background/runtime/**`：RunManager、RuntimePort、RunSnapshot messages、runtime events、diagnostic fallback 和 streaming answer 边界。
- 影响 `src/shared/schemas/**`：新增 page read、iframe read、viewport、scroll、nav/debug/policy/tool result schema。
- 影响 `src/ui/**`：Agent 消息展示长页面读取、iframe 读取、scroll/reobserve 状态和 Debug 工具结果。
- 影响 `tests/node/**`、`tests/dom/**`、`tests/e2e/**`：覆盖长文本分页、article、iframe read/scroll、viewport、tool-calling path、E2E fixtures 和 extension debug SOP。
