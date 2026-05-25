import type { LoopTurn } from './agent-step';

export type LoopSessionStatus =
  | 'running'
  | 'recovering'
  | 'waiting_for_approval'
  | 'waiting_for_user'
  | 'paused'
  | 'cancelled'
  | 'finished'
  | 'failed';

export const LOOP_SESSION_STATUSES: LoopSessionStatus[] = [
  'running',
  'recovering',
  'waiting_for_approval',
  'waiting_for_user',
  'paused',
  'cancelled',
  'finished',
  'failed'
];

export type LoopSession = {
  runId: string;
  task: string;
  status: LoopSessionStatus;
  turns: LoopTurn[];
};

export function createLoopSession(input: {
  runId: string;
  task: string;
}): LoopSession {
  return {
    runId: input.runId,
    task: input.task,
    status: 'running',
    turns: []
  };
}
