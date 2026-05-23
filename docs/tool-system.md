# Tool System

BrowserHelm 的 tool system 是核心资产之一。它需要比普通 function calling 更严格，因为浏览器工具会影响真实页面、真实账号和真实数据。

## 1. 目标

- 所有工具统一命名、注册、校验、执行、记录。
- 工具参数和结果必须 schema 化。
- 工具风险必须可分类。
- 工具暴露给模型前必须按 mode 动态裁剪。
- 高风险工具必须经过 policy / approval。
- ToolResult 必须让模型知道下一步应该怎么恢复。
- ToolSelector 必须按 mode、task、state、permission、risk 动态裁剪工具。

## 2. 目录结构

```txt
src/tools/
├── core/
│   ├── tool-spec.ts
│   ├── tool-registry.ts
│   ├── tool-router.ts
│   ├── tool-context.ts
│   ├── tool-errors.ts
│   ├── tool-risk.ts
│   ├── tool-result-factory.ts
│   ├── tool-selector.ts
│   └── tool-manifest.ts
├── mock/
├── agent/
├── page/
├── a11y/
├── element/
├── nav/
├── viewport/
├── form/
├── debug/
├── cdp/
├── vision/
├── pointer/
├── tab/
├── frame/
├── shadow/
├── file/
├── doc/
├── clipboard/
├── memory/
├── pad/
├── workflow/
├── policy/
├── adapter/
└── trace/
```

## 3. 核心类型

```ts
type ToolMode =
  | 'ask'
  | 'act'
  | 'form'
  | 'debug'
  | 'vision'
  | 'advanced'
  | 'memory'
  | 'internal';

type ToolRisk = 'safe' | 'low' | 'medium' | 'high';

type BrowserHelmTool<TArgs, TResult> = {
  name: string;
  title: string;
  description: string;
  modes: ToolMode[];
  risk: ToolRisk;
  argsSchema: ZodSchema<TArgs>;
  resultSchema: ZodSchema<TResult>;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult<TResult>>;
};
```

## 4. ToolContext

```ts
type ToolContext = {
  runId: string;
  stepId: string;
  tabId: number;
  frameId?: number;
  mode: ToolMode;
  signal: AbortSignal;
  trace: TraceRecorder;
  policy: PolicyEngine;
  contentRpc: ContentRpcClient;
  background: BackgroundServices;
};
```

## 5. ToolResult

```ts
type ToolResult<T = unknown> = {
  ok: boolean;
  code: string;
  summary: string;
  data?: T;
  error?: {
    message: string;
    detail?: unknown;
  };
  nextHints?: string[];
  changedPage?: boolean;
  requiresObserve?: boolean;
  requiresApproval?: boolean;
  approval?: {
    reason: string;
    risk: ToolRisk;
    actionPreview?: string;
  };
  context?: {
    visibility: 'full' | 'summary' | 'hidden';
    summary?: string;
  };
};
```

ToolResult 分层规则：

- 完整 ToolResult 写入 trace / storage，供 UI、复盘和调试使用。
- `summary` 默认进入下一轮模型上下文。
- `data` 默认只写入 trace，不完整进入模型上下文。
- `context.visibility = "summary"` 时，只把 `context.summary` 或 `summary` 放入上下文。
- `context.visibility = "hidden"` 时，只记录 trace，不放入模型上下文。
- `context.visibility = "full"` 仅允许低风险、短结果使用，仍受 ContextPolicy 截断。
- 模型上下文默认只接收 `code`、`summary`、`nextHints`、`changedPage`、`requiresObserve`。
- `requiresApproval` 和 `approval` 用于 HITL 协议；完整 approval request 写入 trace，模型只接收 approval summary。

## 6. 执行流程

```txt
AgentDecision(tool_call)
  -> ToolRouter.find(toolName)
  -> validate args with Zod
  -> ToolSelector / PolicyEngine
  -> if approval required: ApprovalManager.createRequest and pause run
  -> if approved: resume and execute
  -> if denied: return USER_DENIED_APPROVAL
  -> tool.execute(args, ctx)
  -> normalize ToolResult
  -> TraceRecorder.recordToolResult
  -> ContextCompactor.extractSummary
  -> if changedPage/requiresObserve: auto observe
```

## 7. 动态裁剪

不要每轮暴露全部工具。ToolSelector 根据 mode、task、页面状态、权限、风险策略和模型能力决定工具列表。

```txt
mode + task + run state + permission state + risk policy -> available tools
```

```txt
ask: read-only page/a11y/debug tools
act: page/a11y/element/nav/viewport tools
form: form + element + debug + policy tools
debug: debug + page + cdp read tools
vision: vision + pointer limited tools
advanced: tabs/frame/shadow/file/doc/clipboard tools
memory: memory/pad/workflow tools
```

裁剪规则：

- 当前 mode 不需要的工具不暴露。
- 当前权限不可用的工具不暴露。
- high-risk 工具默认不提前暴露，除非 task、mode 和 policy 明确允许。
- Skill、MCP、sub-agent 暴露的工具也必须经过 ToolSelector。

## 8. 风险策略

- `safe`：纯内部或 mock 工具，不触碰真实页面。
- `low`：只读页面或配置读取，通常可自动执行。
- `medium`：可能改变页面状态的普通动作，必须 trace，必要时 auto observe。
- `high`：提交、删除、支付、上传、剪贴板、执行 JS 等高风险动作，必须 approval。

敏感工具示例：

```txt
bh_form_submit_with_approval
bh_file_upload_with_approval
bh_clipboard_read_with_approval
bh_clipboard_write_with_approval
bh_cdp_evaluate_runtime
bh_storage_clear_site_data_with_approval
bh_flow_run_with_approval
```

## 9. 错误恢复

常见错误：

```txt
REF_NOT_FOUND
REF_STALE
CONTENT_SCRIPT_UNAVAILABLE
PAGE_NOT_STABLE
ACTION_BLOCKED_BY_OVERLAY
APPROVAL_DENIED
TOOL_ARGS_INVALID
TOOL_NOT_AVAILABLE_IN_MODE
PROVIDER_NOT_CONFIGURED
```

工具不应该只返回 “failed”。必须给出 `code`、`summary`，失败时给出 `error.message` 和可选 `nextHints`。完整错误细节进入 trace，模型上下文只接收压缩后的恢复提示。

RecoveryPolicy 初始映射：

```txt
REF_STALE -> re-observe
TOOL_ARGS_INVALID -> ask model to repair args
ELEMENT_NOT_FOUND -> find by role/text/name
PAGE_CHANGED -> re-observe
MODEL_OUTPUT_INVALID -> parser recovery or fail
MAX_STEPS_EXCEEDED -> summarize progress and ask user
```
