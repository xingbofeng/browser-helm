import { describe, expect, it } from 'vitest';

import { createPageDataStore } from '../../../../src/ui/stores/page-data-store';

describe('page data store', () => {
  it('derives tab statuses from structured page data', () => {
    const store = createPageDataStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.getState().setSnapshot({
      runId: 'run_1',
      mode: 'form',
      status: 'observed',
      refs: [],
      structuredPageData: {
        observation: tab('ready', 1),
        refs: tab('empty', 0),
        interactive: tab('unsupported', 0),
        forms: tab('error', 0)
      }
    });

    expect(store.getState().tabStatuses).toEqual({
      observation: 'ready',
      refs: 'empty',
      interactive: 'unsupported',
      forms: 'error'
    });
    expect(notifications).toBe(1);
    unsubscribe();
  });
});

function tab(status: 'ready' | 'empty' | 'unsupported' | 'error', count: number) {
  return {
    status,
    summary: status,
    count,
    items: [],
    updatedAt: '2026-05-25T00:00:00.000Z',
    warnings: []
  };
}
