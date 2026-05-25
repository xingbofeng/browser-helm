import { z } from 'zod';

import type { StructuredPageData } from '../shared/schemas/structured-page-data.schema';
import { runModeSchema, type RunMode } from '../shared/schemas/tool.schema';
import { RUNTIME_MESSAGES } from '../shared/constants/event-names';
import type { ApprovalRequest } from '../shared/schemas/approval.schema';
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

export const startRunInputSchema = z.object({
  task: z.string().min(1),
  mode: runModeSchema.default('ask'),
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
    type: z.literal(RUNTIME_MESSAGES.EXECUTE_TOOL),
    input: executeToolInputSchema
  }),
  z.object({
    type: z.literal(RUNTIME_MESSAGES.DECIDE_APPROVAL),
    input: decideApprovalInputSchema
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
export type ExecuteToolInput = z.infer<typeof executeToolInputSchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalInputSchema>;
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

export type RunSnapshot = {
  runId: string;
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
  toolResult?: RuntimeToolResultSnapshot;
  pendingApproval?: ApprovalRequest | undefined;
  trace?: RuntimeEvent[] | undefined;
  error?: {
    code: string;
    message: string;
  };
};

export type RuntimeToolExecutionResult = ToolResult;
export type RuntimeProviderSettings = ProviderSettings;

export type RuntimeEvent = {
  runId: string;
  type: string;
  payload?: unknown;
};
