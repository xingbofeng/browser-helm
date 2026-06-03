import { z } from 'zod';

export const workflowStepSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  summary: z.string().min(1),
  args: z.unknown().optional(),
  argsPreview: z.unknown().optional(),
  risk: z.enum(['safe', 'low', 'medium', 'high']).default('safe'),
  requiresApproval: z.boolean().default(false)
});

export const workflowKeyRefHintSchema = z.object({
  refId: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  locator: z.string().min(1).optional()
});

export const workflowAdapterBindingSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1).optional()
});

export const workflowInvariantSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    id: z.string().min(1).optional(),
    pattern: z.string().min(1)
  }),
  z.object({
    kind: z.literal('dom_state'),
    id: z.string().min(1).optional(),
    refId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    state: z.enum(['present', 'absent', 'enabled', 'disabled'])
  }),
  z.object({
    kind: z.literal('form_value'),
    id: z.string().min(1).optional(),
    refId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    value: z.string()
  }),
  z.object({
    kind: z.literal('text'),
    id: z.string().min(1).optional(),
    text: z.string().min(1)
  }),
  z.object({
    kind: z.literal('adapter_signal'),
    id: z.string().min(1).optional(),
    signal: z.string().min(1),
    expected: z.boolean()
  })
]);

export const workflowInvariantResultSchema = z.object({
  kind: z.enum(['url', 'dom_state', 'form_value', 'text', 'adapter_signal']),
  id: z.string().min(1).optional(),
  status: z.enum(['pass', 'fail']),
  reason: z.string().min(1),
  assertion: workflowInvariantSchema
});

export const workflowMemorySchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  origin: z.string().optional(),
  urlPattern: z.string().min(1).optional(),
  requiredPageTitleHints: z.array(z.string().min(1)).default([]),
  requiredPageTextHints: z.array(z.string().min(1)).default([]),
  keyRefHints: z.array(workflowKeyRefHintSchema).default([]),
  toolManifestHash: z.string().min(1).optional(),
  adapter: workflowAdapterBindingSchema.optional(),
  preconditions: z.array(workflowInvariantSchema).default([]),
  postconditions: z.array(workflowInvariantSchema).default([]),
  completionEvidence: z.array(z.string().min(1)).default([]),
  intent: z.string().min(1),
  taskDescription: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional()
});

export const workflowReplayPreviewSchema = z.object({
  workflowId: z.string().min(1),
  domain: z.string().min(1),
  intent: z.string().min(1),
  stepCount: z.number().int().nonnegative(),
  highRisk: z.boolean(),
  requiresApproval: z.boolean(),
  steps: z.array(workflowStepSchema),
  warnings: z.array(z.string()),
  unmetPreconditions: z.array(z.string()).default([]),
  preconditionResults: z.array(workflowInvariantResultSchema).default([])
});

export const workflowDraftSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  intent: z.string().min(1),
  taskDescription: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
  completionEvidence: z.array(z.string().min(1)),
  requiresPreview: z.literal(true),
  requiresApproval: z.literal(true),
  saved: z.literal(false)
});

export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowKeyRefHint = z.infer<typeof workflowKeyRefHintSchema>;
export type WorkflowAdapterBinding = z.infer<typeof workflowAdapterBindingSchema>;
export type WorkflowInvariant = z.infer<typeof workflowInvariantSchema>;
export type WorkflowInvariantResult = z.infer<typeof workflowInvariantResultSchema>;
export type WorkflowMemory = z.infer<typeof workflowMemorySchema>;
export type WorkflowReplayPreview = z.infer<typeof workflowReplayPreviewSchema>;
export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;
