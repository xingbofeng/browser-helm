import { z } from 'zod';

const toolCallDecisionSchema = z.object({
  type: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  reason: z.string().min(1).optional()
});

const askUserDecisionSchema = z.object({
  type: z.literal('ask_user'),
  question: z.string().min(1)
});

const finishDecisionSchema = z.object({
  type: z.literal('finish'),
  message: z.string().min(1)
});

const failDecisionSchema = z.object({
  type: z.literal('fail'),
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

export const agentDecisionSchema = z.discriminatedUnion('type', [
  toolCallDecisionSchema,
  askUserDecisionSchema,
  finishDecisionSchema,
  failDecisionSchema
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
