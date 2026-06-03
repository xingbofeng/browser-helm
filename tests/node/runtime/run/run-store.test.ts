import { describe, expect, it, vi } from 'vitest';
import { RunStore } from '../../../../src/background/runtime/run/run-store';
import { InMemoryRunSessionPersistence } from '../../../../src/background/runtime/run/session-persistence';
import type { RunRecord } from '../../../../src/background/runtime/run/runtime-service-types';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';

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

  it('stores raw snapshots without policy-dependent memory enrichment', () => {
    const store = new RunStore();

    store.setSnapshot('run_1', {
      runId: 'run_1',
      mode: 'ask',
      status: 'observed',
      observation: {
        title: 'Example App',
        url: 'https://app.example.com/dashboard',
        currentDomain: 'app.example.com',
        origin: 'https://app.example.com',
        visibleTextSummary: 'Dashboard',
        pageStateSummary: 'Ready',
        interactiveCount: 0,
        warnings: []
      },
      toolResult: {
        tool: 'bh_page_observe',
        ok: true,
        code: 'ok',
        summary: 'Observed'
      }
    });

    expect(store.getSnapshot('run_1').toolResult?.tool).toBe('bh_page_observe');
    expect(store.getSnapshot('run_1').memory).toBeUndefined();
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
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { data: 'test' }
    };
    
    store.appendTrace(record, event);
    
    expect(record.trace).toHaveLength(1);
    expect(record.trace[0]!.runId).toBe('run_1');
    expect(record.trace[0]!.type).toBe(TRACE_EVENT_NAMES.STATE_CHANGED);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists audit events for session diagnostics', () => {
    const persistence = new InMemoryRunSessionPersistence();
    const store = new RunStore({ sessionPersistence: persistence });
    const runId = store.createRunId();
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };

    store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { status: 'thinking' }
    });

    expect(persistence.readAuditEvents(runId)).toMatchObject([{
      runId,
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { status: 'thinking' }
    }]);
  });

  it('stamps appended trace events that do not include timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1710000000123);
    const store = new RunStore();
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };

    store.appendTrace(record, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { data: 'test' }
    });

    expect(record.trace[0]?.timestamp).toBe(1710000000123);
  });

  it('prints every appended trace event to the console sink', () => {
    const traceConsole = vi.fn();
    const store = new RunStore({ traceConsole });
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };

    store.appendTrace(record, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { status: 'thinking' }
    });

    expect(traceConsole).toHaveBeenCalledTimes(1);
    const loggedEvent = traceConsole.mock.calls[0]?.[0] as RuntimeEvent | undefined;
    expect(loggedEvent).toMatchObject({
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: { status: 'thinking' }
    });
    expect(loggedEvent?.timestamp).toBeTypeOf('number');
  });

  it('prints invalid trace events as runtime_event_invalid markers', () => {
    const traceConsole = vi.fn();
    const store = new RunStore({ traceConsole });
    const record: RunRecord = {
      task: 'test',
      mode: 'ask',
      trace: []
    };

    store.appendTrace(record, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {}
    });

    expect(traceConsole).toHaveBeenCalledTimes(1);
    const loggedEvent = traceConsole.mock.calls[0]?.[0] as RuntimeEvent | undefined;
    expect(loggedEvent).toMatchObject({
      runId: 'run_1',
      type: 'runtime_event_invalid',
      payload: {
        originalType: TRACE_EVENT_NAMES.TOOL_STARTED
      }
    });
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
      type: TRACE_EVENT_NAMES.STATE_CHANGED
    };
    
    store.appendTrace(record, event);
    
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
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

  it('persists pending approval actions and snapshot summaries for session restore', () => {
    const persistence = new InMemoryRunSessionPersistence();
    const store = new RunStore({ sessionPersistence: persistence });
    const runId = store.createRunId();
    const action = {
      runId,
      tool: 'test_tool',
      args: { param: 'value' }
    };

    store.setSnapshot(runId, {
      runId,
      targetTabId: 42,
      mode: 'form',
      status: 'waiting_for_approval',
      observation: {
        url: 'https://app.example.com',
        title: 'Example',
        currentDomain: 'app.example.com',
        origin: 'https://app.example.com',
        visibleTextSummary: 'Example page',
        pageStateSummary: 'Ready',
        interactiveCount: 1,
        warnings: []
      },
      pendingApproval: {
        id: 'req_1',
        runId,
        stepId: 'step_1',
        tool: 'test_tool',
        argsPreview: {},
        risk: 'high',
        reason: 'Needs approval',
        status: 'pending',
        createdAt: Date.now()
      }
    });
    store.setPendingApprovalAction('req_1', action);

    expect(persistence.readSnapshotSummary(runId)).toMatchObject({
      runId,
      status: 'waiting_for_approval',
      domain: 'app.example.com',
      targetTabId: 42,
      pendingApprovalId: 'req_1',
      pendingApprovalTool: 'test_tool',
      pendingApprovalSummary: 'Needs approval'
    });

    const restoredStore = new RunStore({ sessionPersistence: persistence });
    expect(restoredStore.getPendingApprovalAction('req_1')).toEqual(action);
  });

  it('expires persisted pending approval actions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const persistence = new InMemoryRunSessionPersistence();
    const store = new RunStore({ sessionPersistence: persistence });
    const action = {
      runId: store.createRunId(),
      tool: 'test_tool',
      args: {}
    };

    store.setPendingApprovalAction('req_1', action);
    vi.setSystemTime(1000 + 11 * 60 * 1000);

    const restoredStore = new RunStore({ sessionPersistence: persistence });
    expect(restoredStore.getPendingApprovalAction('req_1')).toBeUndefined();
    vi.useRealTimers();
  });

  it('expires in-memory pending approval actions by the same TTL as restored actions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const store = new RunStore();
    const action = {
      runId: store.createRunId(),
      tool: 'test_tool',
      args: {}
    };

    store.setPendingApprovalAction('req_1', action);
    expect(store.getPendingApprovalAction('req_1')).toBe(action);

    vi.setSystemTime(1000 + 11 * 60 * 1000);
    expect(store.getPendingApprovalAction('req_1')).toBeUndefined();
    vi.useRealTimers();
  });

  it('does not restore a pending approval action from an older run generation', () => {
    const persistence = new InMemoryRunSessionPersistence();
    persistence.persistPendingAction({
      requestId: 'req_1',
      runId: 'run_1',
      generationId: 'run_1:old-generation',
      action: {
        runId: 'run_1',
        tool: 'test_tool',
        args: {}
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    const store = new RunStore({ sessionPersistence: persistence });

    expect(store.createRunId()).toBe('run_1');
    expect(store.getPendingApprovalAction('req_1')).toBeUndefined();
    expect(persistence.readPendingAction('req_1', Date.now())).toBeUndefined();
  });

  it('recovers a persisted pending approval snapshot only with matching tab and domain evidence', () => {
    const persistence = new InMemoryRunSessionPersistence();
    const store = new RunStore({ sessionPersistence: persistence });
    const runId = store.createRunId();
    const generationId = store.getRunGenerationId(runId)!;
    persistence.persistSnapshotSummary({
      runId,
      generationId,
      status: 'waiting_for_approval',
      mode: 'form',
      targetTabId: 42,
      domain: 'app.example.com',
      pendingApprovalId: 'req_1',
      pendingApprovalTool: 'test_tool',
      pendingApprovalSummary: 'Needs approval',
      updatedAt: 1000
    });
    persistence.persistPendingAction({
      requestId: 'req_1',
      runId,
      generationId,
      action: {
        runId,
        tool: 'test_tool',
        args: {
          frameId: 7
        }
      },
      createdAt: 1000,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    persistence.persistApprovalRequest({
      requestId: 'req_1',
      runId,
      generationId,
      request: {
        id: 'req_1',
        runId,
        stepId: 'step_1',
        tool: 'test_tool',
        argsPreview: {},
        risk: 'high',
        reason: 'Needs approval',
        status: 'pending',
        createdAt: 1000
      },
      createdAt: 1000,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const recovered = store.recoverPendingApprovalSession({
      runId,
      requestId: 'req_1',
      currentTabId: 42,
      currentDomain: 'app.example.com',
      currentFrameId: 7
    });

    expect(recovered.status).toBe('recovering');
    expect(store.getSnapshot(runId).status).toBe('recovering');
    expect(store.getSnapshot(runId).pendingApproval?.id).toBe('req_1');

    const failed = store.recoverPendingApprovalSession({
      runId,
      requestId: 'req_1',
      currentTabId: 99,
      currentDomain: 'evil.example',
      currentFrameId: 8
    });

    expect(failed.status).toBe('error');
    expect(failed.error?.message).toContain('tab mismatch');
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
