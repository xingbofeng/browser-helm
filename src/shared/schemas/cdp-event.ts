import { z } from 'zod';

export const cdpAttachStateSchema = z.object({
  tabId: z.number().int().positive(),
  attached: z.boolean(),
  protocolVersion: z.string(),
  owner: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative().optional(),
  attachedAt: z.number().int().nonnegative().optional(),
  lastEventAt: z.number().int().nonnegative().optional(),
  enabledDomains: z.array(z.string().min(1)).optional(),
  detachReason: z.string().optional(),
  reason: z.string().optional()
});

export const cdpConsoleEventSchema = z.object({
  id: z.string().min(1),
  level: z.string().min(1),
  text: z.string(),
  url: z.string().optional(),
  lineNumber: z.number().int().optional(),
  timestamp: z.number().int().nonnegative()
});

export const cdpPerformanceMetricSchema = z.object({
  name: z.string().min(1),
  value: z.number()
});

export const cdpPerformanceSnapshotSchema = z.object({
  tabId: z.number().int().positive(),
  collectedAt: z.number().int().nonnegative(),
  metrics: z.array(cdpPerformanceMetricSchema)
});

export const cdpEventListenerSchema = z.object({
  type: z.string().min(1),
  useCapture: z.boolean().optional(),
  passive: z.boolean().optional(),
  once: z.boolean().optional(),
  handlerDescription: z.string().optional()
});

export type CdpAttachState = z.infer<typeof cdpAttachStateSchema>;
export type CdpConsoleEvent = z.infer<typeof cdpConsoleEventSchema>;
export type CdpPerformanceSnapshot = z.infer<typeof cdpPerformanceSnapshotSchema>;
export type CdpEventListener = z.infer<typeof cdpEventListenerSchema>;
