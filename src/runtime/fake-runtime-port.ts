import { ERROR_CODES } from '../shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES, TRACE_EVENT_NAMES } from '../shared/constants/event-names';
import type {
  DecideApprovalInput,
  ExecuteToolInput,
  HighlightRefInput,
  RuntimeEvent,
  RuntimeProviderSettings,
  RuntimeProviderTestResult,
  RuntimeToolExecutionResult,
  RunSnapshot,
  ReviseGoalInput,
  StartRunInput,
  TestProviderSettingsInput
} from './runtime-messages';
import type { RuntimePort } from './runtime-port';
import { initializeGoalState } from '../agent/goal/goal-state';
import { readLocale } from '../i18n/locale';
import { t } from '../i18n/t';
import { buildPlanState } from '../agent/planning/plan-builder';
import type { BrowserHelmDomainPolicy } from '../shared/domain-policy';
import type { Locale } from '../i18n/types';

type FakeRuntimePortInput = {
  snapshots?: RunSnapshot[] | undefined;
  providerSettings?: RuntimeProviderSettings | undefined;
  domainPolicy?: BrowserHelmDomainPolicy | undefined;
};

export class FakeRuntimePort implements RuntimePort {
  private nextRunId = 1;
  private providerSettings: RuntimeProviderSettings | undefined;
  private domainPolicy: BrowserHelmDomainPolicy | undefined;
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly seedSnapshots: RunSnapshot[] = [];

  constructor(input: FakeRuntimePortInput = {}) {
    this.providerSettings = input.providerSettings;
    this.domainPolicy = input.domainPolicy;
    for (const snapshot of input.snapshots ?? []) {
      this.snapshots.set(snapshot.runId, snapshot);
      this.seedSnapshots.push(snapshot);
    }
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `fake_run_${this.nextRunId}`;
    this.nextRunId += 1;
    const locale = await readLocale();
    const seed = this.seedSnapshots[this.nextRunId - 2];
    this.snapshots.set(runId, {
      ...(seed ?? {
        mode: input.mode ?? 'ask',
        status: 'observed',
        refs: []
      }),
      runId,
      mode: input.mode ?? seed?.mode ?? 'ask',
      messages: seed?.messages ?? fakeInitialMessages(
        runId,
        input.task,
        input.runKind === 'observe_only',
        locale,
        seed
      ),
      streaming: seed?.streaming ?? {
        enabled: true,
        active: false,
        chunkCount: 0,
        fallbackUsed: false
      }
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
    const locale = await readLocale();
    this.snapshots.set(runId, {
      ...snapshot,
      status: 'cancelled',
      pendingApproval: undefined,
      messages: [
        ...(snapshot.messages ?? fakeInitialMessages(runId, runId, false, locale)),
        fakeErrorMessage(runId, t('runtime.error.runCancelled', locale), t('runtime.error.userCancelled', locale))
      ]
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

  async reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    const snapshot = await this.getRunSnapshot(input.runId);
    const locale = await readLocale();
    const goal = initializeGoalState({
      locale,
      task: input.goal,
      mode: snapshot.mode,
      goal: input.goal,
      ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
    });
    const plan = buildPlanState({
      id: `plan_${input.runId}_revised`,
      mode: snapshot.mode,
      task: input.goal,
      updatedAt: Date.now(),
      locale
    });
    const event = {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.PLAN_UPDATED,
      payload: {
        goal,
        plan,
        reason: 'goal_revised'
      }
    };
    const nextSnapshot: RunSnapshot = {
      ...snapshot,
      goal,
      plan,
      canInterrupt: true,
      canReviseGoal: true,
      trace: [...(snapshot.trace ?? []), event]
    };
    this.snapshots.set(input.runId, nextSnapshot);
    this.emit(input.runId, event);
    return nextSnapshot;
  }

  highlightRef(input: HighlightRefInput): Promise<RuntimeToolExecutionResult> {
    return Promise.resolve({
      ok: true,
      code: ERROR_CODES.OK,
      summary: `Highlighted ${input.refId}`,
      changedPage: false,
      requiresObserve: false
    });
  }

  async executeTool(input: ExecuteToolInput): Promise<RuntimeToolExecutionResult> {
    const snapshot = await this.getRunSnapshot(input.runId);
    const result: RuntimeToolExecutionResult = {
      ok: true,
      code: ERROR_CODES.OK,
      summary: `Executed ${input.tool}`,
      changedPage: input.tool === 'bh_form_fill_field',
      requiresObserve: false
    };
    const event = {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: input.tool,
        ok: result.ok,
        code: result.code,
        summary: result.summary
      }
    };
    this.snapshots.set(input.runId, {
      ...snapshot,
      status: input.tool === 'bh_form_submit_with_approval'
        ? 'waiting_for_approval'
        : snapshot.status,
      toolResult: {
        tool: input.tool,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve
      },
      trace: [...(snapshot.trace ?? []), event]
    });
    this.emit(input.runId, event);
    return result;
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
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND,
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
      summary: denied
        ? input.reason ?? 'User denied approval'
        : 'Approval recorded; no action was automatically executed in this version.',
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
          type: denied ? APPROVAL_EVENT_NAMES.DENIED : APPROVAL_EVENT_NAMES.APPROVED,
          payload: {
            requestId: input.requestId,
            reason: input.reason
          }
        }
      ]
    });
    this.emit(input.runId, {
      runId: input.runId,
      type: denied ? APPROVAL_EVENT_NAMES.DENIED : APPROVAL_EVENT_NAMES.APPROVED,
      payload: {
        requestId: input.requestId,
        reason: input.reason,
        code: result.code
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

  getDomainPolicy(): Promise<BrowserHelmDomainPolicy | undefined> {
    return Promise.resolve(this.domainPolicy ? { ...this.domainPolicy } : undefined);
  }

  setDomainPolicy(policy: BrowserHelmDomainPolicy): Promise<void> {
    this.domainPolicy = { ...policy };
    return Promise.resolve();
  }

  async testProviderSettings(input: TestProviderSettingsInput): Promise<RuntimeProviderTestResult> {
    const locale = await readLocale();
    return Promise.resolve({
      ok: Boolean(input.apiKey),
      code: input.apiKey ? ERROR_CODES.OK : ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      message: input.apiKey ? t('provider.test.connected', locale) : t('runtime.error.providerApiKeyMissing', locale),
      supportsStreaming: input.streamingEnabled ?? true,
      model: input.model
    });
  }

  private emit(runId: string, event: RuntimeEvent): void {
    for (const listener of this.listeners.get(runId) ?? []) {
      listener(event);
    }
  }
}

function fakeInitialMessages(
  runId: string,
  task: string,
  observeOnly = false,
  locale: Locale = 'zh',
  seed?: RunSnapshot
) {
  const now = Date.now();
  if (observeOnly) {
    const item = seed?.structuredPageData?.observation?.items?.[0];
    return [
      {
        id: `${runId}:page-summary`,
        role: 'agent' as const,
        kind: 'page_summary' as const,
        status: 'complete' as const,
        title: t('page.observation.summary', locale),
        content: item
          ? t('page.summary.pageLooksLike', locale, { title: item.title }) + '\n' +
            t('page.summary.source', locale, { domain: item.currentDomain }) + '\n' +
            item.pageStateSummary
          : t('page.observation.readonlyDone', locale),
        createdAt: now,
        updatedAt: now
      }
    ];
  }
  return [
    {
      id: `${runId}:task`,
      role: 'user' as const,
      kind: 'task' as const,
      status: 'complete' as const,
      content: task,
      createdAt: now,
      updatedAt: now
    }
  ];
}

function fakeErrorMessage(runId: string, title: string, content: string) {
  const now = Date.now();
  return {
    id: `${runId}:error:${title}`,
    role: 'agent' as const,
    kind: 'error' as const,
    status: 'error' as const,
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}
