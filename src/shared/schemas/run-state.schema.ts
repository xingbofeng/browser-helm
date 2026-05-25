import { z } from 'zod';

export const loopSessionStatusSchema = z.enum([
  'running',
  'recovering',
  'waiting_for_approval',
  'waiting_for_user',
  'paused',
  'cancelled',
  'finished',
  'failed'
]);

export type LoopSessionStatus = z.infer<typeof loopSessionStatusSchema>;
