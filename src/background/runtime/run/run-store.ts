import type { RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../runtime/runtime-messages';
import type { RunRecord, TraceRecord } from './runtime-service-types';

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
    record.trace.push(event);
    for (const listener of this.listeners.get(event.runId) ?? []) {
      listener(event);
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

}
