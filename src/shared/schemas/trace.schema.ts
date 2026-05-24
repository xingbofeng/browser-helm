import { z } from 'zod';

import { approvalRequestSchema } from './approval.schema';
import { agentDecisionSchema } from './agentDecision.schema';
import { runMetadataSchema } from './runMetadata.schema';
import { toolResultSchema, toolRiskSchema } from './toolResult.schema';

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
  type: z.literal('run_started'),
  payload: z.object({
    task: z.string().min(1),
    goal: z.string().min(1).optional(),
    successCriteria: z.array(z.string()).optional(),
    maxSteps: z.number().int().positive(),
    metadata: runMetadataSchema
  })
});

const runFinishedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('run_finished'),
  payload: z.object({
    status: z.literal('finished'),
    message: z.string().min(1)
  })
});

const runFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('run_failed'),
  payload: z.object({
    status: z.literal('failed'),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().optional()
  })
});

const runCancelledEventSchema = traceEventBaseSchema.extend({
  type: z.literal('run_cancelled'),
  payload: z.object({
    status: z.literal('cancelled'),
    reason: z.string().min(1).optional()
  })
});

const turnStartedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('turn_started'),
  payload: z.object({
    stepIndex: z.number().int().nonnegative(),
    intent: z.string().min(1).optional(),
    contextCharCount: z.number().int().nonnegative()
  })
});

const turnFinishedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('turn_finished'),
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
  type: z.literal('model_output_received'),
  payload: z.object({
    rawText: z.string(),
    model: z.string().min(1)
  })
});

const modelDecisionEventSchema = traceEventBaseSchema.extend({
  type: z.literal('model_decision'),
  payload: z.object({
    decision: agentDecisionSchema
  })
});

const decisionParseFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('decision_parse_failed'),
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
  type: z.literal('tool_started'),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown(),
    risk: toolRiskSchema,
    modes: z.array(z.string())
  })
});

const toolResultEventSchema = traceEventBaseSchema.extend({
  type: z.literal('tool_result'),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown(),
    result: toolResultSchema
  })
});

const toolFailedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('tool_failed'),
  payload: z.object({
    tool: z.string().min(1),
    argsPreview: z.unknown().optional(),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().optional()
  })
});

const contextBuiltEventSchema = traceEventBaseSchema.extend({
  type: z.literal('context_built'),
  payload: z.object({
    messageCount: z.number().int().nonnegative(),
    charCount: z.number().int().nonnegative()
  })
});

const contextCompactedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('context_compacted'),
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
  type: z.literal('context_summary'),
  payload: z.object({
    summary: z.string(),
    charCount: z.number().int().nonnegative()
  })
});

const approvalRequiredEventSchema = traceEventBaseSchema.extend({
  type: z.literal('approval_required'),
  payload: z.object({
    request: approvalRequestSchema,
    summary: z.string().min(1)
  })
});

const stateChangedEventSchema = traceEventBaseSchema.extend({
  type: z.literal('state_changed'),
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
