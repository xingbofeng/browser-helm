import { z } from 'zod';

export const recoveryActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('re_observe'),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal('repair_tool_args'),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal('find_alternative_ref'),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal('ask_user'),
    question: z.string().min(1)
  }),
  z.object({
    type: z.literal('fail'),
    reason: z.string().min(1)
  })
]);

export const recoveryStateSchema = z.object({
  action: recoveryActionSchema,
  attempts: z.number().int().nonnegative(),
  budgetRemaining: z.number().int().nonnegative(),
  limitation: z.string().min(1).optional()
});

export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
export type RecoveryState = z.infer<typeof recoveryStateSchema>;
