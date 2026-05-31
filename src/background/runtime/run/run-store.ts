import type { RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import { runtimeEventSchema } from '../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../runtime/runtime-messages';
import type { RunRecord, TraceRecord } from './runtime-service-types';
import { defaultMemoryRepo } from '../../../storage/memory-repo';
import {
  RUN_SESSION_PENDING_TTL_MS,
  type RunSessionPersistence
} from './session-persistence';

type RunStoreOptions = {
  traceConsole?: ((event: RuntimeEvent) => void) | undefined;
  sessionPersistence?: RunSessionPersistence | undefined;
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
  private readonly runGenerations = new Map<string, string>();

  constructor(private readonly options: RunStoreOptions = {}) {}

  createRunId(): string {
    const id = `run_${this.nextId}`;
    this.nextId += 1;
    this.runGenerations.set(id, createGenerationId(id));
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
    const enriched = withDomainMemorySnapshot(snapshot);
    this.snapshots.set(runId, enriched);
    this.options.sessionPersistence?.persistSnapshotSummary({
      runId,
      generationId: this.generationIdFor(runId),
      status: enriched.status,
      mode: enriched.mode,
      ...(enriched.observation?.currentDomain ? { domain: enriched.observation.currentDomain } : {}),
      ...(enriched.pendingApproval?.id ? { pendingApprovalId: enriched.pendingApproval.id } : {}),
      ...(enriched.toolResult?.tool ? { tool: enriched.toolResult.tool } : {}),
      ...(enriched.toolResult?.summary ? { toolSummary: enriched.toolResult.summary } : {}),
      updatedAt: Date.now()
    });
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
      this.persistAuditEvent(validated.data);
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
    this.persistAuditEvent(invalidEvent);
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
    const now = Date.now();
    this.options.sessionPersistence?.persistPendingAction({
      requestId,
      runId: action.runId,
      generationId: this.generationIdFor(action.runId),
      action,
      createdAt: now,
      expiresAt: now + RUN_SESSION_PENDING_TTL_MS
    });
  }

  getPendingApprovalAction(requestId: string): ExecuteToolInput | undefined {
    const memoryAction = this.pendingApprovalActions.get(requestId);
    if (memoryAction) {
      return memoryAction;
    }
    const persisted = this.options.sessionPersistence?.readPendingAction(requestId, Date.now());
    if (!persisted) {
      return undefined;
    }
    const existingGeneration = this.runGenerations.get(persisted.runId);
    if (existingGeneration && persisted.generationId !== existingGeneration) {
      return undefined;
    }
    this.runGenerations.set(persisted.runId, persisted.generationId);
    this.pendingApprovalActions.set(requestId, persisted.action);
    return persisted.action;
  }

  deletePendingApprovalAction(requestId: string): void {
    this.pendingApprovalActions.delete(requestId);
    this.options.sessionPersistence?.deletePendingAction(requestId);
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

  private generationIdFor(runId: string): string {
    const existing = this.runGenerations.get(runId);
    if (existing) {
      return existing;
    }
    const next = createGenerationId(runId);
    this.runGenerations.set(runId, next);
    return next;
  }

  private persistAuditEvent(event: RuntimeEvent): void {
    this.options.sessionPersistence?.persistAuditEvent({
      runId: event.runId,
      generationId: this.generationIdFor(event.runId),
      type: event.type,
      timestamp: event.timestamp ?? Date.now(),
      ...(event.payload === undefined ? {} : { payload: event.payload })
    });
  }

}

function createGenerationId(runId: string): string {
  return `${runId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function withDomainMemorySnapshot(snapshot: RunSnapshot): RunSnapshot {
  const domain = snapshot.observation?.currentDomain;
  if (!domain) {
    return snapshot.memory ? { ...snapshot, memory: undefined } : snapshot;
  }
  return {
    ...snapshot,
    memory: {
      domain,
      entries: defaultMemoryRepo.list(domain)
    }
  };
}
