import { z } from 'zod';

export const elementRefSchema = z.object({
  refId: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  tagName: z.string().min(1),
  visible: z.boolean(),
  disabled: z.boolean().optional()
});

export const a11ySnapshotSchema = z.object({
  url: z.string().min(1).optional(),
  origin: z.string().min(1).optional(),
  currentDomain: z.string().min(1).optional(),
  elements: z.array(elementRefSchema),
  warnings: z.array(z.string()).default([])
});

export const observationSchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  currentDomain: z.string().min(1),
  origin: z.string().min(1),
  visibleText: z.string(),
  visibleTextSummary: z.string(),
  pageStateSummary: z.string(),
  refSummary: z.array(elementRefSchema),
  formFields: z.unknown().optional(),
  warnings: z.array(z.string()).default([])
});

export const observationContextSummarySchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  currentDomain: z.string().min(1),
  origin: z.string().min(1),
  pageType: z.string().optional(),
  pageStateSummary: z.string(),
  visibleTextSummary: z.string(),
  interactiveCount: z.number().int().nonnegative(),
  refHighlights: z.array(elementRefSchema),
  warnings: z.array(z.string()).optional()
});

export type ElementRef = z.infer<typeof elementRefSchema>;
export type A11ySnapshot = z.infer<typeof a11ySnapshotSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type ObservationContextSummary = z.infer<
  typeof observationContextSummarySchema
>;
