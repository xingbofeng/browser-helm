import { z } from 'zod';

export const runtimeCapabilitiesSchema = z.object({
  hasActiveTab: z.boolean(),
  hasDebuggerPermission: z.boolean(),
  hasClipboardPermission: z.boolean(),
  hasDownloadsPermission: z.boolean(),
  hasStorageInspection: z.boolean().optional(),
  hostPermissions: z.array(z.string().min(1)),
  shallowDebugAvailable: z.boolean(),
  cdp: z.enum(['available', 'unavailable', 'reserved'])
});

export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;
