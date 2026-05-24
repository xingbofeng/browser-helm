import { z } from 'zod';

import { toolRiskSchema } from './toolResult.schema';

export const toolModeSchema = z.enum([
  'ask',
  'debug',
  'form',
  'act',
  'vision',
  'advanced',
  'memory',
  'internal'
]);

export const toolSpecMetaSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  modes: z.array(toolModeSchema).min(1),
  risk: toolRiskSchema
});

export type ToolMode = z.infer<typeof toolModeSchema>;
export type ToolSpecMeta = z.infer<typeof toolSpecMetaSchema>;
