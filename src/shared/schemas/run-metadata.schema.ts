import { z } from 'zod';

import { modelCapabilitiesSchema } from './capabilities.schema';
import { runModeSchema } from './tool.schema';

export const runMetadataSchema = z.object({
  schemaVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  toolSchemaVersion: z.string().min(1),
  contextPolicyVersion: z.string().min(1),
  model: z.string().min(1),
  runMode: runModeSchema,
  providerBaseUrl: z.url().optional(),
  modelCapabilities: modelCapabilitiesSchema.optional()
});

export type RunMetadata = z.infer<typeof runMetadataSchema>;
