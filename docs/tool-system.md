# Tool System

BrowserHelm 的 tool system 是核心资产之一。它需要比普通 function calling 更严格，因为浏览器工具会影响真实页面、真实账号和真实数据。

## 1. 目标

- 所有工具统一命名、注册、校验、执行、记录。
- 工具参数和结果必须 schema 化。
- 工具风险必须可分类。
- 工具暴露给模型前必须按 mode 动态裁剪。
- 高风险工具必须经过 policy / approval。
- ToolResult 必须让模型知道下一步应该怎么恢复。

## 2. 目录结构

```txt
src/tools/
├── registry.ts
├── router.ts
├── tool-context.ts
├── tool-errors.ts
├── tool-risk.ts
├── tool-result-factory.ts
├── tool-filter.ts
├── tool-manifest.ts
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

type ToolRisk = 'read' | 'mutating' | 'sensitive' | 'internal';

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
  toolName: string;
  summary: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    suggestedRecovery?: string;
  };
  pageChanged?: boolean;
  requiresObservation?: boolean;
  risk?: ToolRisk;
};
```

## 6. 执行流程

```txt
AgentDecision(tool)
  -> ToolRouter.find(toolName)
  -> validate args with Zod
  -> ToolFilter / PolicyEngine
  -> optional ApprovalManager
  -> tool.execute(args, ctx)
  -> normalize ToolResult
  -> TraceRecorder.recordToolResult
  -> if pageChanged/requiresObservation: auto observe
```

## 7. 动态裁剪

不要每轮暴露全部工具。ToolFilter 根据 mode、页面状态、权限和模型能力决定工具列表。

```txt
ask: read-only page/a11y/debug tools
act: page/a11y/element/nav/viewport tools
form: form + element + debug + policy tools
debug: debug + page + cdp read tools
vision: vision + pointer limited tools
advanced: tabs/frame/shadow/file/doc/clipboard tools
memory: memory/pad/workflow tools
```

## 8. 风险策略

- `read`：可自动执行。
- `mutating`：可执行，但必须 trace，必要时 auto observe。
- `sensitive`：必须 approval。
- `internal`：默认不暴露给模型。

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

工具不应该只返回 “failed”。必须给出 code、message、retryable、suggestedRecovery。
