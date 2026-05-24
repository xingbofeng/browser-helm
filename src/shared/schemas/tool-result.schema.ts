import { z } from 'zod';

export const toolRiskSchema = z.enum(['safe', 'low', 'medium', 'high']);

export const toolRiskLabels = {
  safe: '安全 / Safe',
  low: '低风险 / Low',
  medium: '中风险 / Medium',
  high: '高风险 / High'
} as const satisfies Record<z.infer<typeof toolRiskSchema>, string>;

export const toolResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().min(1),
  summary: z.string().min(1),
  data: z.unknown().optional(),
  error: z
    .object({
      message: z.string().min(1),
      detail: z.unknown().optional()
    })
    .optional(),
  nextHints: z.array(z.string()).optional(),
  changedPage: z.boolean().optional(),
  requiresObserve: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  approval: z
    .object({
      reason: z.string().min(1),
      risk: toolRiskSchema,
      actionPreview: z.string().min(1).optional()
    })
    .optional(),
  context: z
    .object({
      visibility: z.enum(['full', 'summary', 'hidden']),
      summary: z.string().min(1).optional()
    })
    .optional()
});

export type ToolRisk = z.infer<typeof toolRiskSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
