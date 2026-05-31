import { z } from 'zod';

export const screenshotModeSchema = z.enum(['viewport', 'full_page', 'element']);

export const screenshotBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
});

export const screenshotCaptureSchema = z.object({
  id: z.string().min(1),
  tabId: z.number().int().positive(),
  mode: screenshotModeSchema,
  mimeType: z.string().min(1),
  dataUrl: z.string().startsWith('data:image/'),
  selector: z.string().optional(),
  bounds: screenshotBoundsSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  capturedAt: z.number().int().nonnegative(),
  traceSafe: z.boolean().default(false)
});

export const visionObservationSchema = z.object({
  imageRef: z.string().min(1).optional(),
  summary: z.string().min(1),
  visibleText: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  layoutIssues: z.array(z.string()).default([]),
  fallback: z.enum(['none', 'dom_a11y']).default('none'),
  fallbackReason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const pointerClickResultSchema = z.object({
  clicked: z.boolean(),
  tagName: z.string().optional()
});

export type ScreenshotCapture = z.infer<typeof screenshotCaptureSchema>;
export type ScreenshotBounds = z.infer<typeof screenshotBoundsSchema>;
export type VisionObservation = z.infer<typeof visionObservationSchema>;
export type PointerClickResult = z.infer<typeof pointerClickResultSchema>;
