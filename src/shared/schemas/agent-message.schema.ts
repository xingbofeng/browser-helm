import { z } from 'zod';

const obviousSecretPattern = /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_-]{8,})/iu;

const safeTextSchema = z.string().superRefine((value, context) => {
  if (obviousSecretPattern.test(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Text contains sensitive provider credentials'
    });
  }
});

export const agentMessageRoleSchema = z.enum(['user', 'agent', 'system']);

export const agentMessageKindSchema = z.enum([
  'task',
  'page_summary',
  'agent_status',
  'diagnosis',
  'recommendation',
  'error'
]);

export const agentMessageStatusSchema = z.enum([
  'streaming',
  'complete',
  'error'
]);

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  role: agentMessageRoleSchema,
  kind: agentMessageKindSchema,
  status: agentMessageStatusSchema,
  title: safeTextSchema.min(1).optional(),
  content: safeTextSchema,
  reasoning: safeTextSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  debugEventIds: z.array(z.string().min(1)).optional()
});

export const streamingStateSchema = z.object({
  enabled: z.boolean(),
  active: z.boolean().default(false),
  provider: safeTextSchema.min(1).optional(),
  model: safeTextSchema.min(1).optional(),
  chunkCount: z.number().int().nonnegative().default(0),
  fallbackUsed: z.boolean().default(false),
  fallbackReason: safeTextSchema.min(1).optional(),
  finalText: safeTextSchema.optional(),
  usage: z.object({
    inputTokensEstimate: z.number().int().nonnegative(),
    outputTokensEstimate: z.number().int().nonnegative(),
    totalTokensEstimate: z.number().int().nonnegative(),
    costUsdEstimate: z.number().nonnegative().nullable(),
    costEstimateStatus: z.enum(['estimated', 'unpriced'])
  }).optional(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional()
});

export const providerTestResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().min(1),
  message: safeTextSchema.min(1),
  supportsStreaming: z.boolean().optional(),
  model: safeTextSchema.min(1).optional()
});

export type AgentMessageRole = z.infer<typeof agentMessageRoleSchema>;
export type AgentMessageKind = z.infer<typeof agentMessageKindSchema>;
export type AgentMessageStatus = z.infer<typeof agentMessageStatusSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
export type StreamingState = z.infer<typeof streamingStateSchema>;
export type ProviderTestResult = z.infer<typeof providerTestResultSchema>;
