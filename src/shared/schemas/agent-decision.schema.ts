import { z } from 'zod';

export const taskStateDecisionSchema = z.enum(['tool_call', 'finish', 'ask_user', 'fail']);

export const taskStateUpdateSchema = z.object({
  goal: z.string().min(1).optional(),
  completed: z.array(z.string().min(1)).optional(),
  remaining: z.array(z.string().min(1)).optional(),
  recommendedNextDecision: taskStateDecisionSchema.optional(),
  reason: z.string().min(1).optional()
});

const decisionTaskStateFields = {
  taskStateUpdate: taskStateUpdateSchema.optional()
};

const toolCallDecisionSchema = z.object({
  type: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  reason: z.string().min(1).optional(),
  ...decisionTaskStateFields
});

const askUserDecisionSchema = z.object({
  type: z.literal('ask_user'),
  question: z.string().min(1),
  ...decisionTaskStateFields
});

const finishDecisionSchema = z.object({
  type: z.literal('finish'),
  message: z.string().min(1),
  ...decisionTaskStateFields
});

const failDecisionSchema = z.object({
  type: z.literal('fail'),
  message: z.string().min(1),
  code: z.string().min(1).optional(),
  ...decisionTaskStateFields
});

export const agentDecisionSchema = z.discriminatedUnion('type', [
  toolCallDecisionSchema,
  askUserDecisionSchema,
  finishDecisionSchema,
  failDecisionSchema
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
