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

export const runModeSchema = z.enum(['ask', 'debug', 'form', 'act', 'full']);

export const runModeLabels = {
  ask: 'ask' as const,
  debug: 'debug' as const,
  form: 'form' as const,
  act: 'act' as const,
  full: 'full' as const,
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
