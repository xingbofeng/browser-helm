import { z } from 'zod';

export const cdpHeaderMapSchema = z.record(z.string(), z.string());

export const networkRequestRecordSchema = z.object({
  requestId: z.string().min(1),
  url: z.string().min(1),
  method: z.string().min(1),
  status: z.number().int().optional(),
  failed: z.boolean().default(false),
  errorText: z.string().optional(),
  mimeType: z.string().optional(),
  requestHeadersPreview: cdpHeaderMapSchema,
  responseHeadersPreview: cdpHeaderMapSchema.optional(),
  requestBodyPreview: z.string().optional(),
  responseBodyAvailable: z.boolean().default(false),
  responseBodyUnavailableReason: z.string().optional(),
  responseBodyPreviewAvailable: z.boolean().optional(),
  timing: z.object({
    dnsMs: z.number().nonnegative().optional(),
    connectMs: z.number().nonnegative().optional(),
    sendMs: z.number().nonnegative().optional(),
    receiveHeadersEndMs: z.number().nonnegative().optional()
  }).optional(),
  initiator: z.object({
    type: z.string().min(1),
    url: z.string().optional(),
    lineNumber: z.number().optional()
  }).optional(),
  timestamp: z.number().optional()
});

export const requestDetailSchema = networkRequestRecordSchema.extend({
  responseBodyPreview: z.string().optional(),
  responseBase64Encoded: z.boolean().optional()
});

export type NetworkRequestRecord = z.infer<typeof networkRequestRecordSchema>;
export type RequestDetail = z.infer<typeof requestDetailSchema>;
