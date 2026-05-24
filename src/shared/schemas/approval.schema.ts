import { z } from 'zod';

import { toolRiskSchema } from './tool-result.schema';

export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  tool: z.string().min(1),
  argsPreview: z.unknown(),
  risk: toolRiskSchema,
  reason: z.string().min(1),
  actionPreview: z.string().min(1).optional(),
  status: z.enum(['pending', 'approved', 'denied', 'expired']),
  createdAt: z.number().int().nonnegative(),
  decidedAt: z.number().int().nonnegative().optional()
});

export const approvalDecisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  reason: z.string().min(1).optional(),
  decidedAt: z.number().int().nonnegative()
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
