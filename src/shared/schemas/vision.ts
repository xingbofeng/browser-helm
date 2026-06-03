import { z } from 'zod';

export const screenshotModeSchema = z.enum(['viewport', 'full_page', 'element']);
export const screenshotCaptureSourceSchema = z.enum([
  'tabs_capture_visible_tab',
  'cdp_capture_screenshot'
]);
export const screenshotSensitivitySchema = z.enum(['unknown', 'normal', 'sensitive']);

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
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  captureSource: screenshotCaptureSourceSchema,
  fallbackReason: z.string().min(1).optional(),
  truncated: z.boolean().default(false),
  sensitivity: screenshotSensitivitySchema.default('unknown'),
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
  confidence: z.number().min(0).max(1).optional(),
  grounding: z.array(z.object({
    claim: z.string().min(1),
    source: z.enum(['visual_only', 'dom_backed', 'a11y_backed', 'unresolved']),
    confidence: z.enum(['low', 'medium', 'high']),
    evidence: z.array(z.object({
      kind: z.enum(['dom_text', 'a11y_ref']),
      text: z.string().optional(),
      refId: z.string().optional(),
      label: z.string().optional()
    })).default([]),
    reason: z.string().optional()
  })).default([]),
  pointerFallback: z.object({
    allowed: z.boolean(),
    targetConfidence: z.enum(['low', 'medium', 'high']).optional(),
    domRefUnavailable: z.boolean().optional(),
    reason: z.string().optional()
  }).optional()
});

export const pointerClickResultSchema = z.object({
  clicked: z.boolean(),
  tagName: z.string().optional()
});

export type ScreenshotCapture = z.infer<typeof screenshotCaptureSchema>;
export type ScreenshotBounds = z.infer<typeof screenshotBoundsSchema>;
export type VisionObservation = z.infer<typeof visionObservationSchema>;
export type PointerClickResult = z.infer<typeof pointerClickResultSchema>;
