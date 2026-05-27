import { describe, expect, it, vi } from 'vitest';
import { RunStore } from '../../../../src/background/runtime/run/run-store';
import type { RunRecord } from '../../../../src/background/runtime/run/runtime-service-types';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('RunStore', () => {
  it('creates incrementing run IDs', () => {
    const store = new RunStore();
    const id1 = store.createRunId();
    const id2 = store.createRunId();
    const id3 = store.createRunId();
    
    expect(id1).toBe('run_1');
    expect(id2).toBe('run_2');
    expect(id3).toBe('run_3');
  });

  it('returns not_found snapshot for unknown run', () => {
    const store = new RunStore();
    const snapshot = store.getSnapshot('unknown');
    
    expect(snapshot).toEqual({
      runId: 'unknown',
      mode: 'ask',
      status: 'not_found'
    });
  });

  it('stores and retrieves run records', () => {
    const store = new RunStore();
    const record: RunRecord = {
      task: 'test task',
      mode: 'form',
      tabId: 42,
      trace: []
    };
    
    store.setRecord('run_1', record);
    expect(store.getRecord('run_1')).toBe(record);
    expect(store.getRecord('run_2')).toBeUndefined();
  });

  it('stores and retrieves snapshots', () => {
    const store = new RunStore();
    const snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'form',
      status: 'observed'
    };
    
    store.setSnapshot('run_1', snapshot);
    expect(store.getSnapshot('run_1')).toBe(snapshot);
  });

  it('appends trace events to record and notifies listeners', () => {
    const store = new RunStore();
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };
    store.setRecord('run_1', record);
    
    const listener = vi.fn();
    store.subscribe('run_1', listener);
    
    const event: RuntimeEvent = {
      runId: 'run_1',
      type: 'test_event',
      payload: { data: 'test' }
    };
    
    store.appendTrace(record, event);
    
    expect(record.trace).toContain(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('notifies multiple listeners', () => {
    const store = new RunStore();
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };
    store.setRecord('run_1', record);
    
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    store.subscribe('run_1', listener1);
    store.subscribe('run_1', listener2);
    
    const event: RuntimeEvent = {
      runId: 'run_1',
      type: 'test_event'
    };
    
    store.appendTrace(record, event);
    
    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('allows unsubscribe from events', () => {
    const store = new RunStore();
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };
    store.setRecord('run_1', record);
    
    const listener = vi.fn();
    const unsubscribe = store.subscribe('run_1', listener);
    
    const event1: RuntimeEvent = {
      runId: 'run_1',
      type: 'event_1'
    };
    store.appendTrace(record, event1);
    expect(listener).toHaveBeenCalledTimes(1);
    
    unsubscribe();
    
    const event2: RuntimeEvent = {
      runId: 'run_1',
      type: 'event_2'
    };
    store.appendTrace(record, event2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits snapshot_updated event', () => {
    const store = new RunStore();
    const listener = vi.fn<(event: RuntimeEvent) => void>();
    store.subscribe('run_1', listener);
    
    store.notifySnapshotUpdated('run_1');
    
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      runId: 'run_1',
      type: 'snapshot_updated'
    });
    expect(event?.timestamp).toBeTypeOf('number');
  });

  it('manages pending approval actions', () => {
    const store = new RunStore();
    const action = {
      runId: 'run_1',
      tool: 'test_tool',
      args: { param: 'value' }
    };
    
    store.setPendingApprovalAction('req_1', action);
    expect(store.getPendingApprovalAction('req_1')).toBe(action);
    
    store.deletePendingApprovalAction('req_1');
    expect(store.getPendingApprovalAction('req_1')).toBeUndefined();
  });

  it('tracks provider scheduled state per run', () => {
    const store = new RunStore();
    
    expect(store.hasProviderScheduled('run_1')).toBe(false);
    
    store.markProviderScheduled('run_1');
    expect(store.hasProviderScheduled('run_1')).toBe(true);
    
    // Marking again should be idempotent
    store.markProviderScheduled('run_1');
    expect(store.hasProviderScheduled('run_1')).toBe(true);
    
    // Different run should not be marked
    expect(store.hasProviderScheduled('run_2')).toBe(false);
  });

  it('isolates data between different runs', () => {
    const store = new RunStore();
    
    const record1: RunRecord = {
      task: 'task 1',
      mode: 'form',
      trace: []
    };
    const record2: RunRecord = {
      task: 'task 2',
      mode: 'debug',
      trace: []
    };
    
    store.setRecord('run_1', record1);
    store.setRecord('run_2', record2);
    
    const snapshot1: RunSnapshot = {
      runId: 'run_1',
      mode: 'form',
      status: 'observed'
    };
    const snapshot2: RunSnapshot = {
      runId: 'run_2',
      mode: 'debug',
      status: 'error'
    };
    
    store.setSnapshot('run_1', snapshot1);
    store.setSnapshot('run_2', snapshot2);
    
    expect(store.getRecord('run_1')).toBe(record1);
    expect(store.getRecord('run_2')).toBe(record2);
    expect(store.getSnapshot('run_1')).toBe(snapshot1);
    expect(store.getSnapshot('run_2')).toBe(snapshot2);
  });

  it('cleans up listeners when last subscriber unsubscribes', () => {
    const store = new RunStore();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    
    const unsub1 = store.subscribe('run_1', listener1);
    const unsub2 = store.subscribe('run_1', listener2);
    
    unsub1();
    // Should still have listener2
    
    store.notifySnapshotUpdated('run_1');
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
    
    unsub2();
    listener2.mockClear();
    
    // Now all listeners should be cleaned up
    store.notifySnapshotUpdated('run_1');
    expect(listener2).not.toHaveBeenCalled();
  });
});
