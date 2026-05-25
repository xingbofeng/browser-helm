import { describe, expect, it } from 'vitest';

import {
  LOOP_SESSION_STATUSES,
  createLoopSession
} from '../../../../src/agent/kernel/agent-state';

describe('agent-state', () => {
  it('exports all loop session statuses', () => {
    expect(LOOP_SESSION_STATUSES).toEqual([
      'running',
      'recovering',
      'waiting_for_approval',
      'waiting_for_user',
      'paused',
      'cancelled',
      'finished',
      'failed'
    ]);
  });

  it('creates loop session with turn storage', () => {
    const session = createLoopSession({
      runId: 'run_1',
      task: 'Observe page'
    });

    session.turns.push({
      id: 'step_0',
      runId: 'run_1',
      stepIndex: 0
    });

    expect(session.status).toBe('running');
    expect(session.turns).toHaveLength(1);
  });
});
