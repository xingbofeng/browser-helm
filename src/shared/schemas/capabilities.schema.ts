import { z } from 'zod';

export const modelCapabilitiesSchema = z.object({
  supportsStructuredOutput: z.boolean(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  supportsStreaming: z.boolean(),
  maxContextTokens: z.number().int().positive().optional()
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;
