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

export const workflowMemorySchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  origin: z.string().optional(),
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
  warnings: z.array(z.string())
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
export type WorkflowMemory = z.infer<typeof workflowMemorySchema>;
export type WorkflowReplayPreview = z.infer<typeof workflowReplayPreviewSchema>;
export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;
