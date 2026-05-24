import { describe, expect, it } from 'vitest';

import { createAgentStore } from '../../../../src/ui/stores/agent-store';

describe('agent store', () => {
  it('tracks run state, selected step and cancellation', () => {
    const store = createAgentStore();
    const states: string[] = [];
    const unsubscribe = store.subscribe(() => {
      states.push(store.getState().displayState);
    });

    store.getState().startRun({ runId: 'run_1', mode: 'form' });
    store.getState().setDisplayState('executing_tool');
    store.getState().selectStep('step_1');
    store.getState().cancelRun();

    expect(store.getState()).toMatchObject({
      runId: 'run_1',
      mode: 'form',
      displayState: 'cancelled',
      selectedStepId: 'step_1'
    });
    expect(states).toEqual(['observing', 'executing_tool', 'executing_tool', 'cancelled']);
    unsubscribe();
  });
});
