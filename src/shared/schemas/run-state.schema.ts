import { z } from 'zod';

export const loopSessionStatusSchema = z.enum([
  'running',
  'waiting_for_approval',
  'paused',
  'cancelled',
  'finished',
  'failed'
]);

export type LoopSessionStatus = z.infer<typeof loopSessionStatusSchema>;
