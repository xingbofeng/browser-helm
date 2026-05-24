import { z } from 'zod';

export const modelMessageRoleSchema = z.enum([
  'system',
  'user',
  'assistant',
  'tool'
]);

export const modelMessageSchema = z.object({
  role: modelMessageRoleSchema,
  content: z.string()
});

export type ModelMessage = z.infer<typeof modelMessageSchema>;
