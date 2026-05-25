import { z } from 'zod';

import { runModeSchema } from './tool.schema';

export const goalStateSchema = z.object({
  goal: z.string().min(1),
  successCriteria: z.array(z.string().min(1)),
  satisfiedCriteria: z.array(z.string().min(1)).default([]),
  unsatisfiedCriteria: z.array(z.string().min(1)).default([])
});

export const planStepStatusSchema = z.enum([
  'pending',
  'current',
  'done',
  'skipped',
  'blocked'
]);

export const planStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: planStepStatusSchema,
  expectedTool: z.string().min(1).optional(),
  evidence: z.array(z.string().min(1)).optional()
});

export const planStateSchema = z.object({
  id: z.string().min(1),
  mode: runModeSchema,
  steps: z.array(planStepSchema).min(1),
  updatedAt: z.number().int().nonnegative()
});

export const planProgressSummarySchema = z.object({
  done: z.array(z.string().min(1)),
  current: z.string().min(1).optional(),
  pending: z.array(z.string().min(1))
});

export type GoalState = z.infer<typeof goalStateSchema>;
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type PlanState = z.infer<typeof planStateSchema>;
export type PlanProgressSummary = z.infer<typeof planProgressSummarySchema>;
