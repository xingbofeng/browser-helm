import { z } from 'zod';

import { toolRiskSchema } from './tool-result.schema';

export const actionKindSchema = z.enum([
  'click',
  'type',
  'select',
  'submit',
  'focus'
]);

export const actionKindLabels = {
  click: 'click' as const,
  type: 'type' as const,
  select: 'select' as const,
  submit: 'submit' as const,
  focus: 'focus' as const,
} as const satisfies Record<z.infer<typeof actionKindSchema>, string>;

export const actionSourceSchema = z.enum(['agent', 'tool', 'runtime']);

export const actionValuePreviewSchema = z.object({
  masked: z.boolean(),
  preview: z.string(),
  reason: z.string().min(1).optional()
});

export const actionIntentSchema = z.object({
  kind: actionKindSchema,
  refId: z.string().min(1),
  source: actionSourceSchema,
  valuePreview: actionValuePreviewSchema.optional()
}).strict();

export const actionReadinessSchema = z.object({
  canAct: z.boolean(),
  code: z.string().min(1),
  reason: z.string().min(1),
  risk: toolRiskSchema,
  staleRefs: z.boolean(),
  changedPage: z.boolean(),
  requiresObserve: z.boolean(),
  wouldRequireApproval: z.boolean(),
  nextHints: z.array(z.string().min(1)).optional(),
  target: z
    .object({
      refId: z.string().min(1),
      role: z.string().optional(),
      name: z.string().optional(),
      tagName: z.string().min(1).optional(),
      visible: z.boolean().optional(),
      disabled: z.boolean().optional(),
      inputType: z.string().optional(),
      autocomplete: z.string().optional(),
      isSensitive: z.boolean().optional()
    })
    .optional()
});

export type ActionKind = z.infer<typeof actionKindSchema>;
export type ActionSource = z.infer<typeof actionSourceSchema>;
export type ActionValuePreview = z.infer<typeof actionValuePreviewSchema>;
export type ActionIntent = z.infer<typeof actionIntentSchema>;
export type ActionReadiness = z.infer<typeof actionReadinessSchema>;
