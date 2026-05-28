import type { RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import { runtimeEventSchema } from '../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../runtime/runtime-messages';
import type { RunRecord, TraceRecord } from './runtime-service-types';

type RunStoreOptions = {
  traceConsole?: ((event: RuntimeEvent) => void) | undefined;
};

/**
 * Manages per-run state: records, snapshots, trace events, listeners,
 * pending approval actions, and provider scheduling markers.
 */
export class RunStore {
  private nextId = 1;
  private readonly records = new Map<string, RunRecord>();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly pendingApprovalActions = new Map<string, ExecuteToolInput>();

  constructor(private readonly options: RunStoreOptions = {}) {}

  createRunId(): string {
    const id = `run_${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  getSnapshot(runId: string): RunSnapshot {
    return (
      this.snapshots.get(runId) ?? {
        runId,
        mode: 'ask',
        status: 'not_found'
      }
    );
  }

  setSnapshot(runId: string, snapshot: RunSnapshot): void {
    this.snapshots.set(runId, snapshot);
  }

  getRecord(runId: string): RunRecord | undefined {
    return this.records.get(runId);
  }

  setRecord(runId: string, record: RunRecord): void {
    this.records.set(runId, record);
  }

  appendTrace(record: TraceRecord, event: RuntimeEvent): void {
    const eventWithTimestamp = event.timestamp === undefined
      ? { ...event, timestamp: Date.now() }
      : event;
    const validated = runtimeEventSchema.safeParse(eventWithTimestamp);
    if (validated.success) {
      record.trace.push(validated.data);
      this.printTrace(validated.data);
      for (const listener of this.listeners.get(eventWithTimestamp.runId) ?? []) {
        listener(validated.data);
      }
      return;
    }
    // In dev/test, trace corruption is surfaced via the runtime_event_invalid
    // marker rather than throwing; this preserves event stream integrity while
    // making schema violations observable in the trace viewer.
    const invalidEvent: RuntimeEvent = {
      runId: event.runId,
      type: 'runtime_event_invalid',
      timestamp: Date.now(),
      payload: {
        originalType: event.type,
        validationErrors: validated.error.issues.map((i) => i.message)
      }
    };
    record.trace.push(invalidEvent);
    this.printTrace(invalidEvent);
    for (const listener of this.listeners.get(eventWithTimestamp.runId) ?? []) {
      listener(invalidEvent);
    }
  }

  emitTraceEvents(runId: string, events: RuntimeEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners.get(runId) ?? []) {
        listener(event);
      }
    }
  }

  subscribe(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  notifySnapshotUpdated(runId: string): void {
    const event: RuntimeEvent = {
      runId,
      type: 'snapshot_updated',
      timestamp: Date.now()
    };
    for (const listener of this.listeners.get(runId) ?? []) {
      listener(event);
    }
  }

  setPendingApprovalAction(requestId: string, action: ExecuteToolInput): void {
    this.pendingApprovalActions.set(requestId, action);
  }

  getPendingApprovalAction(requestId: string): ExecuteToolInput | undefined {
    return this.pendingApprovalActions.get(requestId);
  }

  deletePendingApprovalAction(requestId: string): void {
    this.pendingApprovalActions.delete(requestId);
  }

  private printTrace(event: RuntimeEvent): void {
    try {
      if (this.options.traceConsole) {
        this.options.traceConsole(event);
        return;
      }
      console.info('[BrowserHelm trace]', event);
    } catch {
      // Console output is diagnostics only; trace storage/listeners remain authoritative.
    }
  }

}
