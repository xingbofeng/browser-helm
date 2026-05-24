import { ERROR_CODES } from '../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../shared/constants/event-names';
import type {
  DecideApprovalInput,
  RuntimeEvent,
  RuntimeProviderSettings,
  RuntimeToolExecutionResult,
  RunSnapshot,
  StartRunInput
} from './runtime-messages';
import type { RuntimePort } from './runtime-port';

type FakeRuntimePortInput = {
  snapshots?: RunSnapshot[] | undefined;
  providerSettings?: RuntimeProviderSettings | undefined;
};

export class FakeRuntimePort implements RuntimePort {
  private nextRunId = 1;
  private providerSettings: RuntimeProviderSettings | undefined;
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly seedSnapshots: RunSnapshot[] = [];

  constructor(input: FakeRuntimePortInput = {}) {
    this.providerSettings = input.providerSettings;
    for (const snapshot of input.snapshots ?? []) {
      this.snapshots.set(snapshot.runId, snapshot);
      this.seedSnapshots.push(snapshot);
    }
  }

  startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `fake_run_${this.nextRunId}`;
    this.nextRunId += 1;
    const seed = this.seedSnapshots[this.nextRunId - 2];
    this.snapshots.set(runId, {
      ...(seed ?? {
        mode: input.mode ?? 'ask',
        status: 'observed',
        refs: []
      }),
      runId,
      mode: input.mode ?? seed?.mode ?? 'ask'
    });
    this.emit(runId, {
      runId,
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        task: input.task
      }
    });
    return Promise.resolve({ runId });
  }

  async cancelRun(runId: string): Promise<void> {
    const snapshot = await this.getRunSnapshot(runId);
    this.snapshots.set(runId, {
      ...snapshot,
      status: 'cancelled',
      pendingApproval: undefined
    });
    this.emit(runId, {
      runId,
      type: TRACE_EVENT_NAMES.RUN_CANCELLED,
      payload: {
        reason: 'user_cancelled'
      }
    });
  }

  async sendUserReply(_runId: string, _message: string): Promise<void> {
    return Promise.resolve();
  }

  getRunSnapshot(runId: string): Promise<RunSnapshot> {
    return Promise.resolve(
      this.snapshots.get(runId) ?? {
        runId,
        mode: 'ask',
        status: 'not_found',
        refs: []
      }
    );
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  async decideApproval(input: DecideApprovalInput): Promise<RuntimeToolExecutionResult> {
    const snapshot = await this.getRunSnapshot(input.runId);
    if (snapshot.pendingApproval?.id !== input.requestId) {
      return {
        ok: false,
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        summary: `Approval request not found: ${input.requestId}`,
        error: {
          message: `Approval request not found: ${input.requestId}`
        }
      };
    }
    const denied = input.decision === 'denied';
    const result = {
      ok: !denied,
      code: denied ? ERROR_CODES.USER_DENIED_APPROVAL : ERROR_CODES.OK,
      summary: denied ? input.reason ?? 'User denied approval' : 'Approval approved',
      changedPage: false,
      requiresObserve: false
    };
    this.snapshots.set(input.runId, {
      ...snapshot,
      status: denied ? 'failed' : 'observed',
      pendingApproval: undefined,
      toolResult: {
        tool: snapshot.pendingApproval.tool,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve
      },
      trace: [
        ...(snapshot.trace ?? []),
        {
          runId: input.runId,
          type: denied ? 'approval_denied' : 'approval_approved',
          payload: {
            requestId: input.requestId,
            reason: input.reason
          }
        }
      ]
    });
    this.emit(input.runId, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.STATE_CHANGED,
      payload: {
        reason: result.code
      }
    });
    return result;
  }

  getProviderSettings(): Promise<RuntimeProviderSettings | undefined> {
    return Promise.resolve(
      this.providerSettings ? { ...this.providerSettings } : undefined
    );
  }

  setProviderSettings(settings: RuntimeProviderSettings): Promise<void> {
    this.providerSettings = { ...settings };
    return Promise.resolve();
  }

  private emit(runId: string, event: RuntimeEvent): void {
    for (const listener of this.listeners.get(runId) ?? []) {
      listener(event);
    }
  }
}
