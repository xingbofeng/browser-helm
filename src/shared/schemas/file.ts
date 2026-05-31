import { z } from 'zod';

export const downloadStateSchema = z.enum(['in_progress', 'interrupted', 'complete', 'unknown']);

export const downloadSummarySchema = z.object({
  downloadId: z.number().int().positive(),
  fileName: z.string().min(1).optional(),
  fileExtension: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  finalUrl: z.string().min(1).optional(),
  mime: z.string().min(1).optional(),
  state: downloadStateSchema,
  danger: z.string().min(1).optional(),
  bytesReceived: z.number().nonnegative().optional(),
  totalBytes: z.number().nonnegative().optional(),
  exists: z.boolean().optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional()
});

export const downloadedFileReadLimitationSchema = z.object({
  download: downloadSummarySchema,
  readable: z.literal(false),
  reason: z.string().min(1),
  fallback: z.string().min(1)
});

export type DownloadSummary = z.infer<typeof downloadSummarySchema>;
export type DownloadedFileReadLimitation = z.infer<typeof downloadedFileReadLimitationSchema>;
