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
  unmetPreconditions: z.array(z.string()).default([])
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
export type WorkflowMemory = z.infer<typeof workflowMemorySchema>;
export type WorkflowReplayPreview = z.infer<typeof workflowReplayPreviewSchema>;
export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;
