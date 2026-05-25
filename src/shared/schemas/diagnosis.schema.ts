import { z } from 'zod';

export const evidenceSourceSchema = z.enum([
  'observation',
  'form',
  'debug',
  'tool_result',
  'user'
]);

export const confidenceSchema = z.enum(['low', 'medium', 'high']);

export const evidenceSchema = z.object({
  source: evidenceSourceSchema,
  summary: z.string().min(1),
  refId: z.string().min(1).optional(),
  traceEventId: z.string().min(1).optional()
});

export const agentFindingSchema = z.object({
  title: z.string().min(1),
  explanation: z.string().min(1),
  evidence: z.array(evidenceSchema).min(1),
  confidence: confidenceSchema
});

export const debugReportSchema = z.object({
  title: z.string().min(1),
  findings: z.array(agentFindingSchema),
  recommendations: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)).optional()
});

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type AgentFinding = z.infer<typeof agentFindingSchema>;
export type DebugReport = z.infer<typeof debugReportSchema>;
