import { z } from 'zod';

import { approvalRequestSchema } from './approval.schema';
import { agentDecisionSchema } from './agent-decision.schema';
import { runMetadataSchema } from './run-metadata.schema';
import { toolResultSchema, toolRiskSchema } from './tool-result.schema';
import { TRACE_EVENT_NAMES } from '../constants/event-names';

const traceEventBaseSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  timestamp: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
  schemaVersion: z.string().min(1)
});

const loopSessionStatusSchema = z.enum([
  'running',
  'waiting_for_approval',
  'paused',
  'cancelled',
  'finished',
  'failed'
]);

const runStartedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.RUN_STARTED),
  payload: z.object({
    task: z.string().min(1),
    goal: z.string().min(1).optional(),
    successCriteria: z.array(z.string()).optional(),
    maxSteps: z.number().int().positive(),
    metadata: runMetadataSchema
  })
});

const runFinishedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.RUN_FINISHED),
  payload: z.object({
    status: z.literal('finished'),
    message: z.string().min(1)
  })
});

const runFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.RUN_FAILED),
  payload: z.object({
    status: z.literal('failed'),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().optional()
  })
});

const runCancelledEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.RUN_CANCELLED),
  payload: z.object({
    status: z.literal('cancelled'),
    reason: z.string().min(1).optional()
  })
});

const turnStartedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.TURN_STARTED),
  payload: z.object({
    stepIndex: z.number().int().nonnegative(),
    intent: z.string().min(1).optional(),
    contextCharCount: z.number().int().nonnegative()
  })
});

const turnFinishedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.TURN_FINISHED),
  payload: z.object({
    stepIndex: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative(),
    endedAt: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    status: z.enum([
      'finished',
      'failed',
      'continued',
      'waiting_for_approval',
      'paused',
      'cancelled'
    ])
  })
});

const modelOutputReceivedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED),
  payload: z.object({
    rawText: z.string(),
    model: z.string().min(1)
  })
});

const modelDecisionEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.MODEL_DECISION),
  payload: z.object({
    decision: agentDecisionSchema
  })
});

const decisionParseFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.DECISION_PARSE_FAILED),
  payload: z.object({
    rawText: z.string(),
    parseError: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      detail: z.unknown().optional()
    }),
    promptVersion: z.string().min(1),
    toolSchemaVersion: z.string().min(1),
    contextPolicyVersion: z.string().min(1),
    schemaVersion: z.string().min(1)
  })
});

const toolStartedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.TOOL_STARTED),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown(),
    risk: toolRiskSchema,
    modes: z.array(z.string())
  })
});

const toolResultEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.TOOL_RESULT),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown(),
    result: toolResultSchema
  })
});

const toolFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.TOOL_FAILED),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown().optional(),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().optional()
  })
});

const contextBuiltEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.CONTEXT_BUILT),
  payload: z.object({
    messageCount: z.number().int().nonnegative(),
    charCount: z.number().int().nonnegative()
  })
});

const contextCompactedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.CONTEXT_COMPACTED),
  payload: z.object({
    retainedStepCount: z.number().int().nonnegative(),
    droppedStepCount: z.number().int().nonnegative(),
    charCount: z.number().int().nonnegative(),
    policy: z.object({
      maxRecentSteps: z.number().int().positive(),
      maxToolResultChars: z.number().int().positive(),
      maxTotalContextChars: z.number().int().positive()
    })
  })
});

const contextSummaryEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.CONTEXT_SUMMARY),
  payload: z.object({
    summary: z.string(),
    charCount: z.number().int().nonnegative()
  })
});

const approvalRequiredEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.APPROVAL_REQUIRED),
  payload: z.object({
    request: approvalRequestSchema,
    summary: z.string().min(1)
  })
});

const stateChangedEventSchema = traceEventBaseSchema.extend({
  type: z.literal(TRACE_EVENT_NAMES.STATE_CHANGED),
  payload: z.object({
    from: loopSessionStatusSchema,
    to: loopSessionStatusSchema,
    reason: z.string().min(1).optional()
  })
});

export const traceEventSchema = z.discriminatedUnion('type', [
  runStartedEventSchema,
  runFinishedEventSchema,
  runFailedEventSchema,
  runCancelledEventSchema,
  turnStartedEventSchema,
  turnFinishedEventSchema,
  modelOutputReceivedEventSchema,
  modelDecisionEventSchema,
  decisionParseFailedEventSchema,
  toolStartedEventSchema,
  toolResultEventSchema,
  toolFailedEventSchema,
  contextBuiltEventSchema,
  contextCompactedEventSchema,
  contextSummaryEventSchema,
  approvalRequiredEventSchema,
  stateChangedEventSchema
]);

export type TraceEvent = z.infer<typeof traceEventSchema>;
export type LoopSessionStatus = z.infer<typeof loopSessionStatusSchema>;
