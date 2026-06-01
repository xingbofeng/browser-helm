import { z } from 'zod';

export const storageAreaSchema = z.enum(['localStorage', 'sessionStorage']);

export const storageEntrySummarySchema = z.object({
  area: storageAreaSchema,
  key: z.string(),
  valuePreview: z.string().optional(),
  valueLength: z.number().int().nonnegative(),
  masked: z.boolean(),
  reason: z.string().optional()
});

export const storageListResultSchema = z.object({
  area: storageAreaSchema,
  count: z.number().int().nonnegative(),
  entries: z.array(storageEntrySummarySchema),
  omittedCount: z.number().int().nonnegative().optional()
});

export const storageGetResultSchema = z.object({
  area: storageAreaSchema,
  key: z.string(),
  found: z.boolean(),
  entry: storageEntrySummarySchema.optional()
});

export const storageMutationOperationSchema = z.enum(['set', 'delete', 'clear']);

export const storageMutationResultSchema = z.object({
  area: storageAreaSchema,
  operation: storageMutationOperationSchema,
  key: z.string().optional(),
  changed: z.boolean(),
  affectedCount: z.number().int().nonnegative().optional(),
  valueLength: z.number().int().nonnegative().optional()
});

export type StorageArea = z.infer<typeof storageAreaSchema>;
export type StorageEntrySummary = z.infer<typeof storageEntrySummarySchema>;
export type StorageListResult = z.infer<typeof storageListResultSchema>;
export type StorageGetResult = z.infer<typeof storageGetResultSchema>;
export type StorageMutationOperation = z.infer<typeof storageMutationOperationSchema>;
export type StorageMutationResult = z.infer<typeof storageMutationResultSchema>;
