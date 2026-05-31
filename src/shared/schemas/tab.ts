import { z } from 'zod';

export const browserTabSummarySchema = z.object({
  tabId: z.number().int().positive(),
  windowId: z.number().int().nonnegative(),
  active: z.boolean(),
  title: z.string(),
  url: z.string().optional(),
  origin: z.string().optional(),
  status: z.string().optional(),
  pinned: z.boolean().optional(),
  audible: z.boolean().optional()
});

export type BrowserTabSummary = z.infer<typeof browserTabSummarySchema>;
