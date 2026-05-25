import { z } from 'zod';

export const consoleErrorSummarySchema = z.object({
  message: z.string().min(1),
  count: z.number().int().positive(),
  source: z.string().min(1).optional()
});

export const networkFailureSummarySchema = z.object({
  url: z.string().min(1),
  method: z.string().min(1),
  errorText: z.string().min(1),
  status: z.number().int().optional()
});

export const pageHealthSummarySchema = z.object({
  consoleErrors: z.array(consoleErrorSummarySchema),
  networkFailures: z.array(networkFailureSummarySchema),
  hasForm: z.boolean(),
  pageStateSummary: z.string().min(1),
  limitations: z.array(z.string().min(1)).optional()
});

export type ConsoleErrorSummary = z.infer<typeof consoleErrorSummarySchema>;
export type NetworkFailureSummary = z.infer<typeof networkFailureSummarySchema>;
export type PageHealthSummary = z.infer<typeof pageHealthSummarySchema>;
