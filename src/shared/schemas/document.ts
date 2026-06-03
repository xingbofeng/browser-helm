import { z } from 'zod';

export const documentReadResultSchema = z.object({
  sourceUrl: z.string().min(1),
  mimeType: z.string().min(1),
  text: z.string(),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  scanned: z.boolean(),
  truncated: z.boolean(),
  unavailableReason: z.string().min(1).optional(),
  parserLimitations: z.array(z.string().min(1)).optional()
});

export type DocumentReadResult = z.infer<typeof documentReadResultSchema>;
