import { z } from 'zod';

export const memoryScopeSchema = z.object({
  domain: z.string().min(1),
  origin: z.string().optional()
});

export const memoryEntrySchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  origin: z.string().optional(),
  kind: z.enum(['domain_fact', 'preference', 'workflow_hint']).default('domain_fact'),
  task: z.string().min(1),
  summary: z.string().min(1),
  sourceRunId: z.string().optional(),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  masked: z.boolean().default(true)
});

export const memoryHitSchema = memoryEntrySchema.extend({
  score: z.number()
});

export const memorySummarySchema = z.object({
  domain: z.string().min(1),
  hits: z.array(memoryHitSchema),
  summary: z.string()
});

export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;
export type MemoryHit = z.infer<typeof memoryHitSchema>;
export type MemorySummary = z.infer<typeof memorySummarySchema>;
