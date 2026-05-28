import { z } from 'zod';

import type { StructuredPageData } from '../shared/schemas/structured-page-data.schema';
import { runModeSchema, type RunMode } from '../shared/schemas/tool.schema';
import {
  APPROVAL_EVENT_NAMES,
  RUNTIME_MESSAGES,
  TRACE_EVENT_NAMES
} from '../shared/constants/event-names';
import type { ApprovalUiState } from '../shared/schemas/approval.schema';
import type { AgentFinding, DebugReport } from '../shared/schemas/diagnosis.schema';
import type {
  GoalState,
  PlanState
} from '../shared/schemas/goal-plan.schema';
import type { TaskClassification } from '../shared/schemas/mode-system.schema';
import type { RecoveryState } from '../shared/schemas/recovery.schema';
import type { RuntimeCapabilities } from '../shared/schemas/runtime-capabilities.schema';
import type { ToolResult } from '../shared/schemas/tool-result.schema';
import type { ProviderSettings } from '../storage/interfaces/settings-store';
import type {
  AgentMessage,
  ProviderTestResult,
  StreamingState
} from '../shared/schemas/agent-message.schema';

export const startRunInputSchema = z.object({
  task: z.string().min(1),
  goal: z.string().min(1).optional(),
  successCriteria: z.array(z.string().min(1)).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'agent', 'system']),
    title: z.string().min(1).optional(),
    content: z.string().min(1)
  })).optional(),
  runKind: z.enum(['observe_only', 'diagnose', 'answer', 'form_assist']).optional(),
  mode: runModeSchema.optional(),
  tabId: z.number().int().positive().optional()
});

export const executeToolInputSchema = z.object({
  runId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown())
});

export const decideApprovalInputSchema = z.object({
  runId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  reason: z.string().min(1).optional()
});

export const reviseGoalInputSchema = z.object({
  runId: z.string().min(1),
  goal: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).optional()
});

export const highlightRefInputSchema = z.object({
  runId: z.string().min(1),
  refId: z.string().min(1)
});

export const providerSettingsInputSchema = z.object({
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  streamingEnabled: z.boolean().optional(),
  allowLocalProviderEndpoints: z.boolean().optional()
});

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(RUNTIME_MESSAGES.START_RUN),
    input: startRunInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.GET_SNAPSHOT),
    runId: z.string().min(1)
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.CANCEL_RUN),
    runId: z.string().min(1)
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.REVISE_GOAL),
    input: reviseGoalInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.HIGHLIGHT_REF),
    input: highlightRefInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.EXECUTE_TOOL),
    input: executeToolInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.DECIDE_APPROVAL),
    input: decideApprovalInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION),
    input: providerSettingsInputSchema
  })
]);

export const runtimeResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.unknown()
  }),
  z.object({
    ok: z.literal(false),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);

export type StartRunInput = z.input<typeof startRunInputSchema>;
export type RunKind = NonNullable<z.infer<typeof startRunInputSchema>['runKind']>;
export type ExecuteToolInput = z.infer<typeof executeToolInputSchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalInputSchema>;
export type ReviseGoalInput = z.infer<typeof reviseGoalInputSchema>;
export type HighlightRefInput = z.infer<typeof highlightRefInputSchema>;
export type TestProviderSettingsInput = z.infer<typeof providerSettingsInputSchema>;
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;
export type RuntimeResponse = z.infer<typeof runtimeResponseSchema>;

export type RuntimeObservationSnapshot = {
  url: string;
  title: string;
  currentDomain: string;
  origin: string;
  visibleTextSummary: string;
  pageStateSummary: string;
  interactiveCount: number;
  warnings: string[];
};

export type RuntimeRefSnapshot = {
  refId: string;
  role?: string | undefined;
  name?: string | undefined;
  tagName: string;
  visible: boolean;
  disabled?: boolean | undefined;
};

export type RuntimeToolResultSnapshot = {
  tool: string;
  ok: boolean;
  code: string;
  summary: string;
  detail?: unknown;
  changedPage?: boolean | undefined;
  requiresObserve?: boolean | undefined;
  requiresApproval?: boolean | undefined;
};

export type RuntimeTaskStateDecision = 'tool_call' | 'finish' | 'ask_user' | 'fail';

export type RuntimeTaskState = {
  goal: string;
  completed: string[];
  remaining: string[];
  recommendedNextDecision?: RuntimeTaskStateDecision | undefined;
  reason?: string | undefined;
  filledFieldRefs: string[];
  verifiedFieldRefs: string[];
  runtimeCompleted: string[];
  runtimeFactsOverrideModelNotes: true;
  updatedBy: 'runtime' | 'model' | 'runtime_and_model';
  updatedAt: number;
};

export type RunSnapshot = {
  runId: string;
  targetTabId?: number | undefined;
  mode: RunMode;
  status:
    | 'created'
    | 'observing'
    | 'thinking'
    | 'executing_tool'
    | 'observed'
    | 'empty'
    | 'error'
    | 'failed'
    | 'finished'
    | 'cancelled'
    | 'not_found'
    | 'waiting_for_approval'
    | 'waiting_for_user'
    | 'recovering';
  observation?: RuntimeObservationSnapshot;
  refs?: RuntimeRefSnapshot[];
  structuredPageData?: StructuredPageData;
  classification?: TaskClassification;
  modeReason?: string;
  capabilities?: RuntimeCapabilities;
  capabilityLimitations?: string[];
  goal?: GoalState;
  plan?: PlanState;
  recovery?: RecoveryState;
  findings?: AgentFinding[];
  debugReport?: DebugReport;
  canInterrupt?: boolean;
  canReviseGoal?: boolean;
  taskState?: RuntimeTaskState | undefined;
  toolResult?: RuntimeToolResultSnapshot;
  pendingApproval?: ApprovalUiState | undefined;
  messages?: AgentMessage[] | undefined;
  streaming?: StreamingState | undefined;
  trace?: RuntimeEvent[] | undefined;
  error?: {
    code: string;
    message: string;
  };
};

export type RuntimeToolExecutionResult = ToolResult;
export type RuntimeProviderSettings = ProviderSettings;
export type RuntimeProviderTestResult = ProviderTestResult;

const runtimeEventBaseSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.number().int().nonnegative().optional()
});

const runtimeEventPayloadSchema = z.record(z.string(), z.unknown());

function runtimeEventWithPayload<TType extends string>(type: TType) {
  return runtimeEventBaseSchema.extend({
    type: z.literal(type),
    payload: runtimeEventPayloadSchema.optional()
  });
}

// ── Typed payload schemas for critical events ──

const toolResultPayloadSchema = z.object({
  tool: z.string().min(1),
  ok: z.boolean(),
  code: z.string(),
  summary: z.string(),
  changedPage: z.boolean().optional(),
  requiresObserve: z.boolean().optional(),
  requiresApproval: z.boolean().optional()
}).passthrough();

const approvalRequiredPayloadSchema = z.object({
  request: z.record(z.string(), z.unknown()),
  summary: z.string().optional()
}).passthrough();

const modelStreamDeltaPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  charCount: z.number().int().nonnegative().optional()
}).passthrough();

const modelStreamFinishedPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  charCount: z.number().int().nonnegative().optional(),
  finalPreview: z.string().optional()
}).passthrough();

const runStartedPayloadSchema = z.object({
  task: z.string().optional(),
  mode: z.string().optional(),
  goal: z.string().optional(),
  successCriteria: z.array(z.string()).optional()
}).passthrough();

const runFailedPayloadSchema = z.object({
  code: z.string().optional(),
  summary: z.string().optional()
}).passthrough();

const decisionParseFailedPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  repairAttempt: z.number().int().nonnegative().optional(),
  parseError: z.record(z.string(), z.unknown()).optional()
}).passthrough();

const fillResultPayloadSchema = z.object({
  filled: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional()
}).passthrough();

const formVerifyResultPayloadSchema = z.object({
  ok: z.boolean().optional(),
  verifyResult: z.record(z.string(), z.unknown()).optional()
}).passthrough();

const formSubmitResultPayloadSchema = z.object({
  formRefId: z.string().optional(),
  outcome: z.string().optional(),
  summary: z.string().optional()
}).passthrough();

const turnStartedPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  maxSteps: z.number().int().nonnegative().optional()
}).passthrough();

const turnFinishedPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional()
}).passthrough();

const toolStartedPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional()
}).passthrough();

const contextBuiltPayloadSchema = z.object({
  stepIndex: z.number().int().nonnegative().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  estimatedChars: z.number().int().nonnegative().optional()
}).passthrough();

export const runtimeEventSchema = z.discriminatedUnion('type', [
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.RUN_STARTED), payload: runStartedPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.RUN_FINISHED), payload: runtimeEventPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.RUN_FAILED), payload: runFailedPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.RUN_CANCELLED),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.TURN_STARTED), payload: turnStartedPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.TURN_FINISHED), payload: turnFinishedPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_DECISION),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.DECISION_PARSE_FAILED), payload: decisionParseFailedPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.TOOL_STARTED), payload: toolStartedPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.TOOL_RESULT), payload: toolResultPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.TOOL_FAILED),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.CONTEXT_BUILT), payload: contextBuiltPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.CONTEXT_COMPACTED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.CONTEXT_SUMMARY),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.APPROVAL_REQUIRED), payload: approvalRequiredPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.STATE_CHANGED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.TASK_CLASSIFIED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.TOOLS_SELECTED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.PLAN_UPDATED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.RECOVERY_ACTION),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.FINDINGS_REPORTED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_STREAM_STARTED),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.MODEL_STREAM_DELTA), payload: modelStreamDeltaPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED), payload: modelStreamFinishedPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_STREAM_FAILED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.PROVIDER_TEST_STARTED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.PROVIDER_TEST_FINISHED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.PROVIDER_TEST_FAILED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.FILL_PLAN_CREATED),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.FIELD_FILL_STARTED),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.FIELD_FILL_RESULT), payload: fillResultPayloadSchema.optional() }),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.FORM_VERIFY_RESULT), payload: formVerifyResultPayloadSchema.optional() }),
  runtimeEventWithPayload(TRACE_EVENT_NAMES.SUBMIT_APPROVAL_REQUESTED),
  runtimeEventBaseSchema.extend({ type: z.literal(TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT), payload: formSubmitResultPayloadSchema.optional() }),
  runtimeEventWithPayload(APPROVAL_EVENT_NAMES.APPROVED),
  runtimeEventWithPayload(APPROVAL_EVENT_NAMES.DENIED),
  runtimeEventWithPayload(APPROVAL_EVENT_NAMES.EXPIRED),
  runtimeEventWithPayload('model_prompt'),
  runtimeEventBaseSchema.extend({
    type: z.literal('snapshot_updated')
  }),
  runtimeEventBaseSchema.extend({
    type: z.literal('runtime_event_invalid'),
    payload: z.object({
      originalType: z.string().optional(),
      validationErrors: z.array(z.string()).optional()
    }).passthrough().optional()
  })
]);

export type RuntimeEventType = z.infer<typeof runtimeEventSchema>['type'];
export type RuntimeEvent = {
  runId: string;
  type: RuntimeEventType | (string & {});
  timestamp?: number | undefined;
  payload?: Record<string, unknown> | undefined;
};
