import { z } from 'zod';

import { screenshotCaptureSchema } from './vision';

export const batchMediaScopeSchema = z.enum(['active_tab', 'current_window']);

export const lazyLoadScrollReportSchema = z.object({
  attempted: z.boolean(),
  steps: z.number().int().nonnegative(),
  initialScrollHeight: z.number().nonnegative(),
  finalScrollHeight: z.number().nonnegative(),
  restoredScrollX: z.number(),
  restoredScrollY: z.number(),
  reason: z.string().min(1).optional()
});

export const batchScreenshotItemSchema = z.object({
  tabId: z.number().int().positive(),
  windowId: z.number().int().optional(),
  pageUrl: z.string().min(1).optional(),
  tabTitle: z.string().min(1).optional(),
  screenshot: screenshotCaptureSchema
});

export const batchMediaFailureSchema = z.object({
  tabId: z.number().int().positive().optional(),
  pageUrl: z.string().min(1).optional(),
  tabTitle: z.string().min(1).optional(),
  reason: z.string().min(1)
});

export const batchFullPageScreenshotResultSchema = z.object({
  scope: batchMediaScopeSchema,
  requestedTabCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  screenshots: z.array(batchScreenshotItemSchema),
  failures: z.array(batchMediaFailureSchema).default([])
});

export const pageImageSourceSchema = z.enum([
  'img',
  'source',
  'css_background',
  'link_icon',
  'open_graph'
]);

export const pageImageItemSchema = z.object({
  url: z.string().min(1),
  rawUrl: z.string().min(1).optional(),
  source: pageImageSourceSchema,
  alt: z.string().optional(),
  title: z.string().optional(),
  selector: z.string().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  naturalWidth: z.number().nonnegative().optional(),
  naturalHeight: z.number().nonnegative().optional(),
  loading: z.string().optional(),
  visible: z.boolean().optional()
});

export const pageImageCollectionSchema = z.object({
  tabId: z.number().int().positive(),
  windowId: z.number().int().optional(),
  pageUrl: z.string().min(1).optional(),
  tabTitle: z.string().min(1).optional(),
  imageCount: z.number().int().nonnegative(),
  lazyLoad: lazyLoadScrollReportSchema,
  images: z.array(pageImageItemSchema)
});

export const batchImageCollectionResultSchema = z.object({
  scope: batchMediaScopeSchema,
  requestedTabCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  totalImageCount: z.number().int().nonnegative(),
  pages: z.array(pageImageCollectionSchema),
  failures: z.array(batchMediaFailureSchema).default([])
});

export type BatchMediaScope = z.infer<typeof batchMediaScopeSchema>;
export type LazyLoadScrollReport = z.infer<typeof lazyLoadScrollReportSchema>;
export type BatchScreenshotItem = z.infer<typeof batchScreenshotItemSchema>;
export type BatchMediaFailure = z.infer<typeof batchMediaFailureSchema>;
export type BatchFullPageScreenshotResult = z.infer<typeof batchFullPageScreenshotResultSchema>;
export type PageImageSource = z.infer<typeof pageImageSourceSchema>;
export type PageImageItem = z.infer<typeof pageImageItemSchema>;
export type PageImageCollection = z.infer<typeof pageImageCollectionSchema>;
export type BatchImageCollectionResult = z.infer<typeof batchImageCollectionResultSchema>;
