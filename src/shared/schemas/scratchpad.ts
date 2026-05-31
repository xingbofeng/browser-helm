import { z } from 'zod';

export const scratchpadEntrySchema = z.object({
  runId: z.string().min(1),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});

export const scratchpadSummarySchema = z.object({
  runId: z.string().min(1),
  content: z.string(),
  charCount: z.number().int().nonnegative()
});

export type ScratchpadEntry = z.infer<typeof scratchpadEntrySchema>;
export type ScratchpadSummary = z.infer<typeof scratchpadSummarySchema>;
