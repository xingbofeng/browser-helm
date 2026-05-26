import { describe, expect, it } from 'vitest';

import { createSimpleStore } from '../../../../src/ui/stores/store-core';

describe('createSimpleStore', () => {
  it('merges object and functional updates and unsubscribes listeners', () => {
    const store = createSimpleStore({
      count: 0,
      label: 'initial'
    });
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      snapshots.push(`${state.count}:${state.label}`);
    });

    store.setState({ label: 'ready' });
    store.setState((state) => ({ count: state.count + 1 }));
    unsubscribe();
    store.setState({ label: 'ignored' });

    expect(store.getState()).toEqual({
      count: 1,
      label: 'ignored'
    });
    expect(snapshots).toEqual(['0:ready', '1:ready']);
  });
});
