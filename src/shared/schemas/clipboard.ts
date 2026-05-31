import { z } from 'zod';

export const clipboardApprovalRequestResultSchema = z.object({
  operation: z.enum(['read', 'write']),
  textLength: z.number().int().nonnegative().optional()
});

export const clipboardWriteResultSchema = z.object({
  operation: z.literal('write'),
  textLength: z.number().int().nonnegative(),
  changedClipboard: z.boolean()
});

export const clipboardReadResultSchema = z.object({
  operation: z.literal('read'),
  sensitiveText: z.string(),
  textLength: z.number().int().nonnegative()
});

export type ClipboardApprovalRequestResult = z.infer<typeof clipboardApprovalRequestResultSchema>;
export type ClipboardWriteResult = z.infer<typeof clipboardWriteResultSchema>;
export type ClipboardReadResult = z.infer<typeof clipboardReadResultSchema>;
