# 架构

## 1. 架构目标

BrowserHelm 的目标不是做一个普通聊天插件，而是做一个浏览器内的小型 Agent Runtime：

```txt
用户任务 -> Agent Kernel -> Tool Router -> Browser Tools -> Observation -> Trace/Memory -> 下一步决策
```

核心约束：

- 不强制后端。
- 纯前端 / extension 内运行。
- BYOK 或用户自定义 OpenAI-compatible endpoint。
- UI 必须透明展示 agent 行为。
- 工具执行必须受 runtime 和 policy 控制。

## 2. 技术选型

### Extension Framework：WXT

选择原因：

- 支持 MV3。
- TypeScript 体验好。
- entrypoint 模型清楚，适合 background/content/sidepanel/options 分层。
- 后续 Chrome / Firefox 兼容路线更清晰。

替代方案：Plasmo。

不选原因：Plasmo 更偏产品化封装，BrowserHelm 需要长期掌控底层 extension runtime。

### UI：React

选择原因：

- Side panel cockpit 交互复杂。
- Timeline、Inspector、Approval、Settings、Memory Viewer 都适合组件化。
- 生态成熟。

### Language：TypeScript

选择原因：

- 跨 background/content/ui/shared 需要强类型协议。
- Tool args/result 需要 schema + type 对齐。
- Agent decision 和 trace event 必须可校验。

### Schema：Zod

用途：

- AgentDecision validation。
- Tool args validation。
- ToolResult validation。
- Observation validation。
- Memory/Trace/Approval schema。
- RPC message parsing。

### Storage：Dexie.js + chrome.storage

- Dexie.js：IndexedDB，用于 trace、memory、workflow、large local state。
- chrome.storage：settings、provider config、轻量状态。

### UI State：Zustand

用途：

- agent run state。
- step timeline。
- approval modal state。
- settings panel state。
- selected trace/tool/observation。

### A11y / DOM

使用：

- DOM APIs。
- `dom-accessibility-api`。
- `aria-query`。
- 自研 accessible tree builder。
- 自研 ref-map。

说明：content script 无法稳定直接拿到完整 Chrome accessibility tree，因此 BrowserHelm 构建的是 accessibility-like tree，目标是适合 agent 使用，而不是完全复刻浏览器内部 a11y tree。

### Model Layer

早期使用自研 OpenAI-compatible REST client：

- `apiKey`
- `baseUrl`
- `model`
- `supportsTools`
- `supportsVision`
- `supportsStreaming`

不把 Vercel AI SDK 或 OpenAI Agents SDK 放进 early core。

## 3. Runtime 分层

```txt
src/entrypoints/
  background.ts       Agent loop host, routing, model, storage, debugger
  content.ts          DOM/a11y/form/page execution
  sidepanel/          Cockpit UI
  popup/              Lightweight launcher
  options/            Settings surface

src/agent/
  kernel/             Loop, state machine, prompt builder, parser
  model/              Provider abstraction
  policy/             Risk, approval, masking, permissions
  prompts/            System/tool/recovery/mode prompts

src/tools/
  registry.ts         Tool registration
  router.ts           Tool dispatch
  */                  Tool families

src/page/
  observe/            Observation builder
  a11y/               A11y-like tree + ref map
  dom/                DOM actions/readers
  messaging/          Content RPC

src/background/
  managers            Tabs, debugger, downloads, storage, model runner

src/ui/
  components          Cockpit UI
  stores              Zustand stores
  styles              Theme and global CSS

src/storage/
  repos               IndexedDB/chrome.storage repositories

src/shared/
  schemas/types       Zod schemas, shared types, protocols

src/adapters/
  site adapters       GitHub/Gmail/etc guidance and workflows

src/eval/
  replay/eval         Later platform evaluation

tests/
  unit/               Pure behavior tests for agent, tools, page, shared, storage
  integration/        Cross-layer runtime tests for agent-tool-content/storage flows
  component/          React component tests for cockpit surfaces
  e2e/                Extension/browser user-path tests
  fixtures/           HTML pages, model outputs, traces, tool results, screenshots
  helpers/            Mock model, extension runtime, tool context, storage helpers
```

## 4. 数据流

### 普通任务

```txt
ChatPanel.submit(task)
  -> background.startRun(task)
  -> AgentLoop.buildTurnInput()
  -> ModelClient.complete()
  -> DecisionParser.parse()
  -> ToolRouter.execute(decision.tool)
  -> ContentRPC / BackgroundManager
  -> ToolResult
  -> TraceRecorder.recordStep()
  -> Auto observe when needed
  -> next turn or finish
```

### click/type 后强制 observe

```txt
LLM: bh_element_click(refId)
  -> runtime 执行 click
  -> runtime 检测 pageChanged / stale / error
  -> runtime 自动 bh_page_observe
  -> LLM 只看到摘要后的 ToolResult + 新 Observation
```

不是每个 runtime event 都发给模型。模型只看必要摘要。

### 高风险动作审批

```txt
LLM: bh_form_submit_with_approval(formRef)
  -> RiskClassifier: sensitive
  -> ApprovalManager: create approval request
  -> UI: ApprovalDialog
  -> user approve/deny
  -> execute or return USER_DENIED_APPROVAL
```

## 5. 最终目录结构

```txt
browser-helm/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── tools.md
│   ├── memory.md
│   ├── security.md
│   ├── research.md
│   ├── decisions.md
│   ├── roadmap/
│   ├── specs/
│   └── design/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts
│   │   ├── content.ts
│   │   ├── sidepanel/
│   │   ├── popup/
│   │   └── options/
│   ├── agent/
│   │   ├── kernel/
│   │   ├── model/
│   │   ├── policy/
│   │   └── prompts/
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── router.ts
│   │   ├── page/
│   │   ├── a11y/
│   │   ├── element/
│   │   ├── nav/
│   │   ├── viewport/
│   │   ├── form/
│   │   ├── debug/
│   │   ├── cdp/
│   │   ├── vision/
│   │   ├── pointer/
│   │   ├── tab/
│   │   ├── frame/
│   │   ├── shadow/
│   │   ├── file/
│   │   ├── doc/
│   │   ├── clipboard/
│   │   ├── memory/
│   │   ├── workflow/
│   │   ├── policy/
│   │   ├── adapter/
│   │   └── trace/
│   ├── page/
│   ├── background/
│   ├── ui/
│   ├── storage/
│   ├── shared/
│   ├── adapters/
│   └── eval/
├── tests/
│   ├── unit/
│   │   ├── agent/
│   │   ├── tools/
│   │   ├── page/
│   │   ├── storage/
│   │   └── shared/
│   ├── integration/
│   │   ├── agent-tools/
│   │   ├── background-content/
│   │   └── storage/
│   ├── component/
│   │   └── ui/
│   ├── e2e/
│   │   ├── extension/
│   │   └── workflows/
│   ├── fixtures/
│   │   ├── pages/
│   │   ├── model-outputs/
│   │   ├── traces/
│   │   └── tool-results/
│   └── helpers/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── wxt.config.ts
└── implementation-notes.md
```

## 6. 关键设计取舍

- Agent loop 自研，SDK 只作为未来 adapter。
- Tool schema 服务浏览器，不服务某个 SDK。
- ToolResult 必须统一，避免模型无法判断下一步。
- Observation 必须压缩，不把完整 DOM 丢给模型。
- UI 是产品核心，不是 debug 附件。
- Trace 从第一天就记录。

## 7. 相关详细设计文档

- `docs/prompts.md`：System prompt 拆分、PromptBuilder 拼装顺序、memory/replay/safety prompt 策略。
- `docs/tool-system.md`：ToolRegistry、ToolRouter、ToolResult、ToolRisk、动态工具裁剪、错误恢复。
