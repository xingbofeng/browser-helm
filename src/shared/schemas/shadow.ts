import { z } from 'zod';

export const shadowRootSummarySchema = z.object({
  hostSelector: z.string().min(1),
  hostTagName: z.string().min(1),
  mode: z.literal('open'),
  childCount: z.number().int().nonnegative(),
  interactiveCount: z.number().int().nonnegative(),
  textPreview: z.string()
});

export const shadowElementSummarySchema = z.object({
  tagName: z.string().min(1),
  name: z.string(),
  role: z.string().optional(),
  text: z.string().optional()
});

export const shadowQueryResultSchema = z.object({
  hostSelector: z.string().min(1),
  selector: z.string().min(1),
  elements: z.array(shadowElementSummarySchema)
});

export type ShadowRootSummary = z.infer<typeof shadowRootSummarySchema>;
export type ShadowQueryResult = z.infer<typeof shadowQueryResultSchema>;
