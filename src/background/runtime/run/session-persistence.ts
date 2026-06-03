import type { ExecuteToolInput, RunSnapshot } from '../../../runtime/runtime-messages';
import type { ApprovalRequest } from '../../../shared/schemas/approval.schema';

export const RUN_SESSION_PENDING_TTL_MS = 10 * 60 * 1000;
const STORAGE_KEY = 'browserHelm.runSession.v1';

export type PersistedPendingAction = {
  requestId: string;
  runId: string;
  generationId: string;
  action: ExecuteToolInput;
  createdAt: number;
  expiresAt: number;
};

export type PersistedApprovalRequest = {
  requestId: string;
  runId: string;
  generationId: string;
  request: ApprovalRequest;
  createdAt: number;
  expiresAt: number;
};

export type PersistedRunSnapshotSummary = {
  runId: string;
  generationId: string;
  status: RunSnapshot['status'];
  mode: RunSnapshot['mode'];
  targetTabId?: number | undefined;
  domain?: string | undefined;
  pendingApprovalId?: string | undefined;
  pendingApprovalTool?: string | undefined;
  pendingApprovalSummary?: string | undefined;
  tool?: string | undefined;
  toolSummary?: string | undefined;
  updatedAt: number;
};

export type PersistedRunAuditEvent = {
  runId: string;
  generationId: string;
  type: string;
  timestamp: number;
  payload?: unknown;
};

export type RunSessionPersistence = {
  persistSnapshotSummary(summary: PersistedRunSnapshotSummary): void;
  persistPendingAction(action: PersistedPendingAction): void;
  persistApprovalRequest(request: PersistedApprovalRequest): void;
  persistAuditEvent(event: PersistedRunAuditEvent): void;
  readSnapshotSummary(runId: string): PersistedRunSnapshotSummary | undefined;
  readPendingAction(requestId: string, now: number): PersistedPendingAction | undefined;
  readApprovalRequest(requestId: string, now: number): PersistedApprovalRequest | undefined;
  deletePendingAction(requestId: string): void;
};

type PersistedRunSessionState = {
  snapshots: PersistedRunSnapshotSummary[];
  pendingActions: PersistedPendingAction[];
  approvalRequests: PersistedApprovalRequest[];
  auditEvents: PersistedRunAuditEvent[];
};

export class InMemoryRunSessionPersistence implements RunSessionPersistence {
  private readonly snapshots = new Map<string, PersistedRunSnapshotSummary>();
  private readonly pendingActions = new Map<string, PersistedPendingAction>();
  private readonly approvalRequests = new Map<string, PersistedApprovalRequest>();
  private readonly auditEvents: PersistedRunAuditEvent[] = [];

  persistSnapshotSummary(summary: PersistedRunSnapshotSummary): void {
    this.snapshots.set(summary.runId, summary);
  }

  persistPendingAction(action: PersistedPendingAction): void {
    this.pendingActions.set(action.requestId, action);
  }

  persistApprovalRequest(request: PersistedApprovalRequest): void {
    this.approvalRequests.set(request.requestId, request);
  }

  persistAuditEvent(event: PersistedRunAuditEvent): void {
    this.auditEvents.push(event);
    if (this.auditEvents.length > 200) {
      this.auditEvents.shift();
    }
  }

  readPendingAction(requestId: string, now: number): PersistedPendingAction | undefined {
    const action = this.pendingActions.get(requestId);
    if (!action) {
      return undefined;
    }
    if (action.expiresAt <= now) {
      this.pendingActions.delete(requestId);
      return undefined;
    }
    return action;
  }

  readApprovalRequest(requestId: string, now: number): PersistedApprovalRequest | undefined {
    const request = this.approvalRequests.get(requestId);
    if (!request) {
      return undefined;
    }
    if (request.expiresAt <= now) {
      this.approvalRequests.delete(requestId);
      return undefined;
    }
    return request;
  }

  deletePendingAction(requestId: string): void {
    this.pendingActions.delete(requestId);
  }

  readSnapshotSummary(runId: string): PersistedRunSnapshotSummary | undefined {
    return this.snapshots.get(runId);
  }

  readAuditEvents(runId?: string): PersistedRunAuditEvent[] {
    return this.auditEvents.filter((event) => runId ? event.runId === runId : true);
  }

  protected replaceState(state: PersistedRunSessionState, now = Date.now()): void {
    this.snapshots.clear();
    this.pendingActions.clear();
    this.approvalRequests.clear();
    this.auditEvents.length = 0;
    for (const summary of state.snapshots) {
      this.snapshots.set(summary.runId, summary);
    }
    for (const action of state.pendingActions) {
      if (action.expiresAt > now) {
        this.pendingActions.set(action.requestId, action);
      }
    }
    for (const request of state.approvalRequests) {
      if (request.expiresAt > now) {
        this.approvalRequests.set(request.requestId, request);
      }
    }
    this.auditEvents.push(...state.auditEvents.slice(-200));
  }

  protected snapshotState(): PersistedRunSessionState {
    return {
      snapshots: [...this.snapshots.values()],
      pendingActions: [...this.pendingActions.values()],
      approvalRequests: [...this.approvalRequests.values()],
      auditEvents: [...this.auditEvents]
    };
  }
}

export class ChromeStorageRunSessionPersistence extends InMemoryRunSessionPersistence {
  readonly ready: Promise<void>;

  constructor(private readonly area = chromeStorageSession()) {
    super();
    this.ready = this.hydrate();
  }

  override persistSnapshotSummary(summary: PersistedRunSnapshotSummary): void {
    super.persistSnapshotSummary(summary);
    void this.flush();
  }

  override persistPendingAction(action: PersistedPendingAction): void {
    super.persistPendingAction(action);
    void this.flush();
  }

  override persistApprovalRequest(request: PersistedApprovalRequest): void {
    super.persistApprovalRequest(request);
    void this.flush();
  }

  override persistAuditEvent(event: PersistedRunAuditEvent): void {
    super.persistAuditEvent(event);
    void this.flush();
  }

  override deletePendingAction(requestId: string): void {
    super.deletePendingAction(requestId);
    void this.flush();
  }

  private async hydrate(): Promise<void> {
    if (!this.area) {
      return;
    }
    const data = await this.area.get(STORAGE_KEY);
    const parsed = parseState(data[STORAGE_KEY]);
    if (parsed) {
      this.replaceState(parsed);
    }
  }

  private async flush(): Promise<void> {
    if (!this.area) {
      return;
    }
    await this.ready;
    await this.area.set({ [STORAGE_KEY]: this.snapshotState() });
  }
}

export function createDefaultRunSessionPersistence(): RunSessionPersistence {
  return chromeStorageSession()
    ? new ChromeStorageRunSessionPersistence()
    : new InMemoryRunSessionPersistence();
}

function chromeStorageSession(): chrome.storage.StorageArea | undefined {
  return globalThis.chrome?.storage?.session;
}

function parseState(value: unknown): PersistedRunSessionState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    snapshots: Array.isArray(value.snapshots) ? value.snapshots.flatMap(parseSnapshotSummary) : [],
    pendingActions: Array.isArray(value.pendingActions) ? value.pendingActions.flatMap(parsePendingAction) : [],
    approvalRequests: Array.isArray(value.approvalRequests) ? value.approvalRequests.flatMap(parseApprovalRequest) : [],
    auditEvents: Array.isArray(value.auditEvents) ? value.auditEvents.flatMap(parseAuditEvent) : []
  };
}

function parseSnapshotSummary(value: unknown): PersistedRunSnapshotSummary[] {
  if (!isRecord(value) ||
    typeof value.runId !== 'string' ||
    typeof value.generationId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.mode !== 'string' ||
    typeof value.updatedAt !== 'number') {
    return [];
  }
  return [value as PersistedRunSnapshotSummary];
}

function parsePendingAction(value: unknown): PersistedPendingAction[] {
  if (!isRecord(value) ||
    typeof value.requestId !== 'string' ||
    typeof value.runId !== 'string' ||
    typeof value.generationId !== 'string' ||
    !isRecord(value.action) ||
    typeof value.createdAt !== 'number' ||
    typeof value.expiresAt !== 'number') {
    return [];
  }
  return [value as PersistedPendingAction];
}

function parseApprovalRequest(value: unknown): PersistedApprovalRequest[] {
  if (!isRecord(value) ||
    typeof value.requestId !== 'string' ||
    typeof value.runId !== 'string' ||
    typeof value.generationId !== 'string' ||
    !isRecord(value.request) ||
    typeof value.createdAt !== 'number' ||
    typeof value.expiresAt !== 'number') {
    return [];
  }
  return [value as PersistedApprovalRequest];
}

function parseAuditEvent(value: unknown): PersistedRunAuditEvent[] {
  if (!isRecord(value) ||
    typeof value.runId !== 'string' ||
    typeof value.generationId !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.timestamp !== 'number') {
    return [];
  }
  return [value as PersistedRunAuditEvent];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
