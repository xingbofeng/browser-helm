import { describe, expect, it } from 'vitest';

import { createTraceStore } from '../../../../src/ui/stores/trace-store';

describe('trace store', () => {
  it('groups runtime events and selects event detail', () => {
    const store = createTraceStore();

    store.getState().setEvents([
      { runId: 'run_1', type: 'run_started' },
      { runId: 'run_1', type: 'approval_required', payload: { summary: 'Need approval' } }
    ]);
    store.getState().selectEvent('run_1:1');

    expect(store.getState().items.map((item) => item.label)).toEqual([
      'Run started',
      'Approval required'
    ]);
    expect(store.getState().selectedEvent?.type).toBe('approval_required');
  });
});
