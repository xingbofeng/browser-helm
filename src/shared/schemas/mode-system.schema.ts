import { z } from 'zod';

import { runModeSchema } from './tool.schema';

export const classificationConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const taskClassificationSchema = z.object({
  taskType: runModeSchema,
  mode: runModeSchema,
  reason: z.string().min(1),
  confidence: classificationConfidenceSchema,
  matchedSignals: z.array(z.string().min(1)).default([])
});

export const hiddenToolReasonSchema = z.object({
  tool: z.string().min(1),
  reason: z.string().min(1)
});

export const toolSelectionSchema = z.object({
  mode: runModeSchema,
  visibleTools: z.array(z.string().min(1)),
  hiddenTools: z.array(hiddenToolReasonSchema).default([]),
  limitations: z.array(z.string().min(1)).default([])
});

export type ClassificationConfidence = z.infer<
  typeof classificationConfidenceSchema
>;
export type TaskClassification = z.infer<typeof taskClassificationSchema>;
export type HiddenToolReason = z.infer<typeof hiddenToolReasonSchema>;
export type ToolSelection = z.infer<typeof toolSelectionSchema>;
