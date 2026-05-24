import { describe, expect, it } from 'vitest';

import { createTraceStore } from '../../../../src/ui/stores/trace-store';

describe('trace store', () => {
  it('groups runtime events and selects event detail', () => {
    const store = createTraceStore();
    const selected: Array<string | undefined> = [];
    const unsubscribe = store.subscribe(() => {
      selected.push(store.getState().selectedEvent?.type);
    });

    store.getState().setEvents([
      { runId: 'run_1', type: 'run_started' },
      { runId: 'run_1', type: 'approval_required', payload: { summary: 'Need approval' } }
    ]);
    store.getState().selectEvent('run_1:1');

    expect(store.getState().items.map((item) => item.label)).toEqual([
      'Run 开始',
      '等待审批'
    ]);
    expect(store.getState().selectedEvent?.type).toBe('approval_required');
    expect(selected).toEqual([undefined, 'approval_required']);
    unsubscribe();
  });
});
