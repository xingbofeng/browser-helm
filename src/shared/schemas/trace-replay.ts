import { z } from 'zod';

export const traceReplayFrameSchema = z.object({
  traceEventId: z.string().min(1),
  kind: z.enum(['model_output', 'parsed_decision', 'tool_call', 'tool_result', 'error']),
  timestamp: z.number().int().nonnegative().optional(),
  summary: z.string().min(1),
  payload: z.unknown().optional(),
  errorCode: z.string().min(1).optional()
});

export type TraceReplayFrame = z.infer<typeof traceReplayFrameSchema>;

