import { z } from 'zod';

export const stepSummarySchema = z.object({
  stepId: z.string().min(1),
  tool: z.string().min(1).optional(),
  outcome: z.enum(['success', 'failed', 'skipped']),
  summary: z.string().min(1),
  nextHints: z.array(z.string().min(1)).optional(),
  completionEvidence: z.array(z.string().min(1)).default([])
});

export const runSummarySchema = z.object({
  runId: z.string().min(1),
  task: z.string().min(1),
  outcome: z.enum(['success', 'failed', 'cancelled', 'running']),
  keyFindings: z.array(z.string().min(1)),
  reusableSteps: z.array(stepSummarySchema),
  completionCriteria: z.array(z.string().min(1)).default([]),
  completionEvidence: z.array(z.string().min(1)).default([]),
  unmetCriteria: z.array(z.string().min(1)).default([]),
  failureReason: z.string().min(1).optional()
});

export const sessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  domain: z.string().min(1).optional(),
  taskGoal: z.string().min(1),
  importantPageState: z.array(z.string().min(1)),
  confirmedActions: z.array(z.string().min(1)),
  reusableLocators: z.array(z.string().min(1)),
  nextTimeHints: z.array(z.string().min(1)),
  runSummaries: z.array(runSummarySchema).default([])
});

export type StepSummary = z.infer<typeof stepSummarySchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

