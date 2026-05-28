# trace event

## 用途

定义 BrowserHelm 的 trace event 契约。

## 状态

v0.1 起作为 Agent Kernel 的核心契约。

## 类型草案

所有 TraceEvent 共享一个 envelope：

```ts
type TraceEventType =
  | 'run_started'
  | 'run_finished'
  | 'run_failed'
  | 'run_cancelled'
  | 'turn_started'
  | 'turn_finished'
  | 'model_output_received'
  | 'model_decision'
  | 'decision_parse_failed'
  | 'tool_started'
  | 'tool_result'
  | 'tool_failed'
  | 'context_built'
  | 'context_compacted'
  | 'context_summary'
  | 'approval_required'
  | 'state_changed';

type TraceEvent<TPayload = unknown> = {
  id: string;
  runId: string;
  turnId?: string;
  stepIndex?: number;
  type: TraceEventType;
  timestamp: number;
  durationMs?: number;
  schemaVersion: string;
  payload: TPayload;
};
```

v0.1 核心 payload：

```ts
type RunStartedPayload = {
  task: string;
  goal?: string;
  successCriteria?: string[];
  maxSteps: number;
  metadata: RunMetadata;
};

type RunFinishedPayload = {
  status: 'finished';
  message: string;
};

type RunFailedPayload = {
  status: 'failed';
  code: string;
  message: string;
  retryable?: boolean;
};

type RunCancelledPayload = {
  status: 'cancelled';
  reason?: string;
};

type TurnStartedPayload = {
  stepIndex: number;
  intent?: string;
  contextCharCount: number;
};

type TurnFinishedPayload = {
  stepIndex: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status:
    | 'finished'
    | 'failed'
    | 'continued'
    | 'waiting_for_approval'
    | 'paused'
    | 'cancelled';
};

type ModelOutputReceivedPayload = {
  rawText: string;
  model: string;
};

type ModelDecisionPayload = {
  decision: AgentDecision;
};

type DecisionParseFailedPayload = {
  rawText: string;
  parseError: {
    code: string;
    message: string;
    detail?: unknown;
  };
};

type ToolStartedPayload = {
  tool: string;
  argsPreview: unknown;
  risk: ToolRisk;
  modes: ToolMode[];
};

type ToolResultPayload = {
  tool: string;
  argsPreview: unknown;
  result: ToolResult;
};

type ToolFailedPayload = {
  tool: string;
  argsPreview?: unknown;
  code: string;
  message: string;
  retryable?: boolean;
};

type ContextBuiltPayload = {
  messageCount: number;
  charCount: number;
};

type ContextCompactedPayload = {
  retainedStepCount: number;
  droppedStepCount: number;
  charCount: number;
  policy: ContextPolicy;
};

type ContextSummaryPayload = {
  summary: string;
  charCount: number;
};

type ApprovalRequiredPayload = {
  request: ApprovalAuditRequest;
  summary: string;
};

type StateChangedPayload = {
  from: LoopSessionStatus;
  to: LoopSessionStatus;
  reason?: string;
};
```

## 规则

- `model_output_received.rawText` 必须保存，parser 失败也不能丢。
- 写入 trace 前必须经过统一 redaction；approval 事件只能包含脱敏后的 audit request，不能把 API key、obvious token 或真实表单字段值写入 trace。
- ToolResult full data 进入 trace；模型上下文只收 ContextCompactor 摘要。
- step/tool span 必须记录 `startedAt`、`endedAt`、`durationMs`；TraceEvent envelope 保留事件自身的 `timestamp`。
- run metadata 必须包含 `schemaVersion`、`promptVersion`、`toolSchemaVersion`、`contextPolicyVersion`、`model`。
- `OPENAI_BASE_URL` 可以作为 provider metadata 写入 trace；`OPENAI_API_KEY` 绝不写入 trace。
- v0.1 的 planning reservation 只记录 `goal`、`successCriteria`、`maxSteps` 和当前 turn `intent`，不生成完整 plan。
- trace replay 依赖 raw model output、parsed decision、tool args、tool result、timestamps 和 error code。

## 后续落地

该 spec 后续会转成 `src/shared/schemas/` 下的 Zod schema。
