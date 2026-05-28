import { describe, expect, it, vi } from 'vitest';

import { GoalRevisionService } from '../../../../src/background/runtime/run/goal-revision-service';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('GoalRevisionService', () => {
  it('updates goal, plan, snapshot, and trace independently of lifecycle flow', async () => {
    const record = {
      task: 'old goal',
      mode: 'ask' as const,
      trace: [] as RuntimeEvent[]
    };
    const store = {
      getRecord: vi.fn(() => record),
      getSnapshot: vi.fn(() => ({
        runId: 'run_1',
        mode: 'ask' as const,
        status: 'observed' as const,
        trace: record.trace
      })),
      appendTrace: vi.fn((target: { trace: RuntimeEvent[] }, event: RuntimeEvent) => {
        target.trace.push(event);
      }),
      setSnapshot: vi.fn()
    };
    const service = new GoalRevisionService(store);

    const snapshot = await service.reviseGoal({
      runId: 'run_1',
      goal: 'new goal',
      successCriteria: ['answer clearly']
    });

    expect(snapshot.goal?.goal).toBe('new goal');
    expect(snapshot.plan?.id).toBe('plan_run_1_revised');
    expect(record.trace.at(-1)).toMatchObject({
      type: 'plan_updated',
      payload: {
        reason: 'goal_revised'
      }
    });
    expect(store.setSnapshot).toHaveBeenCalledWith('run_1', snapshot);
  });
});
