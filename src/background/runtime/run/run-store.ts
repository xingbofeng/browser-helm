import type { RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import { runtimeEventSchema } from '../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../runtime/runtime-messages';
import type { RunRecord, TraceRecord } from './runtime-service-types';
import {
  recoverPersistedRunSession,
  SESSION_RECOVERY_UNSAFE
} from './session-recovery';
import {
  RUN_SESSION_PENDING_TTL_MS,
  type PersistedPendingAction,
  type RunSessionPersistence
} from './session-persistence';

type RunStoreOptions = {
  traceConsole?: ((event: RuntimeEvent) => void) | undefined;
  sessionPersistence?: RunSessionPersistence | undefined;
};

type RecoverPendingApprovalSessionInput = {
  runId: string;
  requestId: string;
  currentTabId?: number | undefined;
  currentDomain?: string | undefined;
  currentFrameId?: number | string | undefined;
  now?: number | undefined;
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
  private readonly pendingApprovalActions = new Map<string, PersistedPendingAction>();
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
    this.snapshots.set(runId, snapshot);
    const targetTabId = snapshot.targetTabId ?? this.records.get(runId)?.tabId;
    this.options.sessionPersistence?.persistSnapshotSummary({
      runId,
      generationId: this.generationIdFor(runId),
      status: snapshot.status,
      mode: snapshot.mode,
      ...(targetTabId === undefined ? {} : { targetTabId }),
      ...(snapshot.observation?.currentDomain ? { domain: snapshot.observation.currentDomain } : {}),
      ...(snapshot.pendingApproval?.id ? { pendingApprovalId: snapshot.pendingApproval.id } : {}),
      ...(snapshot.pendingApproval?.tool ? { pendingApprovalTool: snapshot.pendingApproval.tool } : {}),
      ...(snapshot.pendingApproval?.reason ? { pendingApprovalSummary: snapshot.pendingApproval.reason } : {}),
      ...(snapshot.toolResult?.tool ? { tool: snapshot.toolResult.tool } : {}),
      ...(snapshot.toolResult?.summary ? { toolSummary: snapshot.toolResult.summary } : {}),
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
    const now = Date.now();
    const pendingAction: PersistedPendingAction = {
      requestId,
      runId: action.runId,
      generationId: this.generationIdFor(action.runId),
      action,
      createdAt: now,
      expiresAt: now + RUN_SESSION_PENDING_TTL_MS
    };
    this.pendingApprovalActions.set(requestId, pendingAction);
    this.options.sessionPersistence?.persistPendingAction(pendingAction);
  }

  getPendingApprovalAction(requestId: string): ExecuteToolInput | undefined {
    return this.getPendingApprovalActionState(requestId)?.action;
  }

  getPendingApprovalActionState(requestId: string): PersistedPendingAction | undefined {
    const now = Date.now();
    const memoryAction = this.pendingApprovalActions.get(requestId);
    if (memoryAction) {
      return this.validPendingApprovalAction(requestId, memoryAction, now);
    }
    const persisted = this.options.sessionPersistence?.readPendingAction(requestId, now);
    if (!persisted) {
      return undefined;
    }
    const validPersisted = this.validPendingApprovalAction(requestId, persisted, now);
    if (!validPersisted) {
      return undefined;
    }
    this.pendingApprovalActions.set(requestId, validPersisted);
    return validPersisted;
  }

  recoverPendingApprovalSession(input: RecoverPendingApprovalSessionInput): RunSnapshot {
    const persistence = this.options.sessionPersistence;
    if (!persistence) {
      const snapshot = unsafeRecoverySnapshot(input.runId, 'session persistence unavailable');
      this.setSnapshot(input.runId, snapshot);
      return snapshot;
    }
    const now = input.now ?? Date.now();
    const persistedAction = persistence.readPendingAction(input.requestId, now);
    const currentGenerationId = this.runGenerations.get(input.runId);
    if (persistedAction && !currentGenerationId) {
      this.runGenerations.set(input.runId, persistedAction.generationId);
    }
    const snapshot = recoverPersistedRunSession({
      persistence,
      runId: input.runId,
      requestId: input.requestId,
      now,
      currentGenerationId: currentGenerationId ?? persistedAction?.generationId,
      currentTabId: input.currentTabId,
      currentDomain: input.currentDomain,
      currentFrameId: input.currentFrameId
    });
    this.setSnapshot(input.runId, snapshot);
    return snapshot;
  }

  deletePendingApprovalAction(requestId: string): void {
    this.pendingApprovalActions.delete(requestId);
    this.options.sessionPersistence?.deletePendingAction(requestId);
  }

  getRunGenerationId(runId: string): string | undefined {
    return this.runGenerations.get(runId);
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

  private validPendingApprovalAction(
    requestId: string,
    pendingAction: PersistedPendingAction,
    now: number
  ): PersistedPendingAction | undefined {
    if (pendingAction.expiresAt <= now) {
      this.deletePendingApprovalAction(requestId);
      return undefined;
    }
    const existingGeneration = this.runGenerations.get(pendingAction.runId);
    if (existingGeneration && pendingAction.generationId !== existingGeneration) {
      this.deletePendingApprovalAction(requestId);
      return undefined;
    }
    if (!existingGeneration) {
      this.runGenerations.set(pendingAction.runId, pendingAction.generationId);
    }
    return pendingAction;
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

function unsafeRecoverySnapshot(runId: string, reason: string): RunSnapshot {
  const message = `Session recovery unsafe: ${reason}`;
  return {
    runId,
    mode: 'ask',
    status: 'error',
    error: {
      code: SESSION_RECOVERY_UNSAFE,
      message
    },
    recovery: {
      action: {
        type: 'fail',
        reason: message
      },
      attempts: 0,
      budgetRemaining: 0,
      limitation: message
    }
  };
}
