import { describe, expect, it } from 'vitest';

import { appendTurn, createAgentContext } from '../../../../src/agent/kernel/agent-context';

describe('agent-context', () => {
  it('creates initial context and appends turns immutably', () => {
    const ctx = createAgentContext('run_1', {
      task: 'Inspect page',
      goal: 'Find submit issue',
      maxSteps: 3
    });
    const next = appendTurn(ctx, {
      id: 't1',
      runId: 'run_1',
      stepIndex: 0
    });

    expect(ctx.turns).toHaveLength(0);
    expect(next.turns).toHaveLength(1);
  });
});
