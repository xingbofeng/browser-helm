import { z } from 'zod';

import { toolRiskSchema } from './tool-result.schema';

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

export const runModeSchema = z.enum(['ask', 'debug', 'form', 'act']);

export const runModeLabels = {
  ask: '询问 / Ask',
  debug: '调试 / Debug',
  form: '表单 / Form',
  act: '执行 / Act'
} as const satisfies Record<z.infer<typeof runModeSchema>, string>;

export const toolSpecMetaSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  modes: z.array(toolModeSchema).min(1),
  risk: toolRiskSchema
});

export type ToolMode = z.infer<typeof toolModeSchema>;
export type RunMode = z.infer<typeof runModeSchema>;
export type ToolSpecMeta = z.infer<typeof toolSpecMetaSchema>;
