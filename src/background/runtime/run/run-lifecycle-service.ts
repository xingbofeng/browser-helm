import type { ExecuteToolInput, RunSnapshot, RuntimeEvent, StartRunInput, ReviseGoalInput } from '../../../runtime/runtime-messages';
import type { ModelClient } from '../../../agent/model/model-client';
import type { SettingsStore } from '../../../storage/interfaces/settings-store';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import type { ToolResult } from '../../../shared/schemas/tool-result.schema';
import type { ToolRouter } from '../../../tools/core/tool-router';
import { resolveRunMode } from '../../../agent/modes/mode-system';
import { initializeGoalState } from '../../../agent/goal/goal-state';
import { buildPlanState } from '../../../agent/planning/plan-builder';
import { ERROR_CODES } from '../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../shared/constants/event-names';
import { TOOL_NAMES } from '../../../shared/constants/tool-names';
import type { RunRecord } from './runtime-service-types';
import { readLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import type { Locale } from '../../../i18n/types';
import { GoalRevisionService } from './goal-revision-service';
import { UnifiedRuntimeAgentLoop } from './unified-runtime-agent-loop';

export type LifecycleStore = {
  createRunId: () => string;
  setRecord: (runId: string, record: RunRecord) => void;
  getRecord: (runId: string) => RunRecord | undefined;
  getSnapshot: (runId: string) => RunSnapshot;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  notifySnapshotUpdated: (runId: string) => void;
};

export type LifecycleDeps = {
  store: LifecycleStore;
  createToolRouter: (tabId: number) => ToolRouter;
  getActiveTabId: () => Promise<number | undefined>;
  snapshotFromObserveResult: (runId: string, mode: RunMode, result: ToolResult, trace: RuntimeEvent[]) => RunSnapshot;
  withRunMessages: (snapshot: RunSnapshot, record: { task: string; trace: RuntimeEvent[]; runKind?: RunRecord['runKind']; locale?: Locale }) => RunSnapshot;
  fallbackSnapshotFields: (mode: RunMode, observeResult: ToolResult, locale: Locale) => Partial<RunSnapshot>;
  streamingStateFromTrace: (trace: RuntimeEvent[]) => RunSnapshot['streaming'];
  emptyStreamingState: () => NonNullable<RunSnapshot['streaming']>;
  initialMessages: (runId: string, task: string, locale: Locale, options: { includeUserTask?: boolean; includeObserveStatus?: boolean }) => NonNullable<RunSnapshot['messages']>;
  errorMessage: (runId: string, title: string, content: string) => NonNullable<RunSnapshot['messages']>[number];
  executeTool: (input: ExecuteToolInput) => Promise<unknown>;
  settingsStore?: SettingsStore | undefined;
  createProviderModelClient?: ((settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient) | undefined;
};

export class RunLifecycleService {
  public onDiagnosticsResolved?: (runId: string, enriched: RunSnapshot) => void;
  private readonly goalRevision: GoalRevisionService;
  private readonly unifiedAgentLoop: UnifiedRuntimeAgentLoop | undefined;

  constructor(private readonly deps: LifecycleDeps) {
    this.goalRevision = new GoalRevisionService(deps.store);
    if (deps.settingsStore) {
      this.unifiedAgentLoop = new UnifiedRuntimeAgentLoop({
        settingsStore: deps.settingsStore,
        createProviderModelClient: deps.createProviderModelClient,
        getSnapshot: (runId) => deps.store.getSnapshot(runId),
        setSnapshot: (runId, snapshot) => deps.store.setSnapshot(runId, snapshot),
        notifySnapshotUpdated: (runId) => deps.store.notifySnapshotUpdated(runId),
        appendTrace: (record, event) => deps.store.appendTrace(record, event),
        executeTool: deps.executeTool,
        withRunMessages: deps.withRunMessages
      });
    }
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = this.deps.store.createRunId();
    const locale = await readLocale();
    const resolvedMode = resolveRunMode({
      locale,
      task: input.task,
      ...(input.mode ? { explicitMode: input.mode } : {})
    });
    const mode = resolvedMode.mode;
    const goal = initializeGoalState({
      locale,
      task: input.task,
      mode,
      ...(input.goal ? { goal: input.goal } : {}),
      ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
    });
    const plan = buildPlanState({
      id: `plan_${runId}`,
      mode,
      task: goal.goal,
      updatedAt: Date.now(),
      locale
    });
    const runKind = resolveRunKind(input, mode);
    const observeOnly = runKind === 'observe_only';
    const initialRunMessages = this.deps.initialMessages(runId, input.task, locale, {
      includeUserTask: !observeOnly,
      includeObserveStatus: observeOnly
    });
    const record = {
      task: input.task,
      mode,
      trace: [] as RuntimeEvent[],
      runKind,
      locale
    };
    this.deps.store.setRecord(runId, record);
    this.deps.store.appendTrace(record, {
      runId, type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        task: input.task,
        mode,
        ...(input.goal ? { goal: input.goal } : {}),
        ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
      }
    });
    this.deps.store.setSnapshot(runId, {
      runId, mode, status: 'observing',
      classification: resolvedMode.classification,
      modeReason: resolvedMode.reason,
      goal,
      plan,
      messages: initialRunMessages,
      streaming: this.deps.emptyStreamingState(),
      trace: record.trace
    });

    if (shouldRequestActMode(input, mode, resolvedMode.classification.actionIntent)) {
      this.deps.store.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.STATE_CHANGED,
        payload: {
          status: 'waiting_for_user',
          reason: 'ask_mode_action_intent_requires_act'
        }
      });
      this.deps.store.setSnapshot(runId, {
        runId,
        mode,
        status: 'waiting_for_user',
        classification: resolvedMode.classification,
        modeReason: resolvedMode.reason,
        goal,
        plan,
        messages: [
          ...(initialRunMessages ?? []),
          modeSwitchRequestMessage(runId, locale)
        ],
        streaming: this.deps.emptyStreamingState(),
        trace: record.trace
      });
      return { runId };
    }

    const tabId = input.tabId ?? (await this.deps.getActiveTabId());
    if (!tabId) {
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: { code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, summary: 'No active browser tab is available' }
      });
      this.deps.store.setSnapshot(runId, {
        runId, mode, status: 'error', refs: [],
        error: { code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, message: 'No active browser tab is available' },
        messages: [
          ...(this.deps.initialMessages(runId, input.task, locale, {
            includeUserTask: !observeOnly,
            includeObserveStatus: observeOnly
          }) ?? []),
          this.deps.errorMessage(runId, t('runtime.error.noActiveTab', locale), 'No active browser tab is available')
        ],
        streaming: this.deps.emptyStreamingState(),
        trace: record.trace
      });
      return { runId };
    }

    (record as Record<string, unknown>).tabId = tabId;
    void this.observeInitial(runId, record as RunRecord & { tabId: number }, tabId);
    return { runId };
  }

  async observeInitial(
    runId: string,
    record: RunRecord & { tabId: number },
    tabId: number
  ): Promise<void> {
    this.deps.store.appendTrace(record, {
      runId, type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} }
    });
    const router = this.deps.createToolRouter(tabId);
    let result: ToolResult;
    try {
      result = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        {
          runId,
          stepId: `${runId}:observe`,
          runMode: record.mode,
          ...(record.locale ? { locale: record.locale } : {})
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial observation failed';
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: { code: ERROR_CODES.RUNTIME_UNAVAILABLE, summary: message }
      });
      const msgs = this.deps.initialMessages(runId, record.task, record.locale ?? 'zh', {
        includeUserTask: record.runKind !== 'observe_only',
        includeObserveStatus: record.runKind === 'observe_only'
      }) ?? [];
      this.deps.store.setSnapshot(runId, {
        ...this.deps.store.getSnapshot(runId),
        status: 'error', refs: [],
        error: { code: ERROR_CODES.RUNTIME_UNAVAILABLE, message },
        messages: [...msgs, this.deps.errorMessage(runId, t('runtime.error.observationFailed', record.locale ?? 'zh'), message)],
        streaming: this.deps.streamingStateFromTrace(record.trace),
        trace: record.trace
      });
      return;
    }

    if (this.deps.store.getSnapshot(runId).status === 'cancelled') return;
    this.deps.store.appendTrace(record, {
      runId, type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: { tool: TOOL_NAMES.PAGE_OBSERVE, ok: result.ok, code: result.code, summary: result.summary, changedPage: result.changedPage, requiresObserve: result.requiresObserve, requiresApproval: result.requiresApproval }
    });
    const baseSnapshot = this.deps.withRunMessages(
      this.deps.snapshotFromObserveResult(runId, record.mode, result, record.trace),
      record
    );

    if (record.mode === 'form' || record.mode === 'debug') {
      void this.handleDiagnosticFlow(runId, record, tabId, result, baseSnapshot);
      return;
    }
    void this.handleSimpleFlow(runId, record, tabId, result, baseSnapshot);
  }

  private async handleDiagnosticFlow(
    runId: string,
    record: RunRecord & { tabId: number },
    tabId: number,
    result: ToolResult,
    baseSnapshot: RunSnapshot
  ): Promise<void> {
    this.deps.store.setSnapshot(runId, baseSnapshot);
    try {
      const fallback: RunSnapshot = {
        ...baseSnapshot,
        ...this.deps.fallbackSnapshotFields(record.mode, result, record.locale ?? 'zh'),
        trace: record.trace,
        messages: this.deps.withRunMessages(baseSnapshot, record).messages,
        streaming: this.deps.streamingStateFromTrace(record.trace),
        canInterrupt: true, canReviseGoal: true
      };
      this.deps.store.setSnapshot(runId, fallback);
      if (record.runKind !== 'observe_only' && this.unifiedAgentLoop) {
        await this.unifiedAgentLoop.run({ runId, record, maxSteps: 8 });
        return;
      }
    } catch {
      this.deps.store.setSnapshot(runId, { ...baseSnapshot, trace: record.trace, canInterrupt: true, canReviseGoal: true });
    }
  }

  private async handleSimpleFlow(
    runId: string,
    record: RunRecord & { tabId: number },
    tabId: number,
    result: ToolResult,
    baseSnapshot: RunSnapshot
  ): Promise<void> {
    let nextSnapshot: RunSnapshot = {
      ...baseSnapshot,
      ...this.deps.fallbackSnapshotFields(record.mode, result, record.locale ?? 'zh'),
      trace: record.trace,
      messages: this.deps.withRunMessages(baseSnapshot, record).messages,
      streaming: this.deps.streamingStateFromTrace(record.trace),
      canInterrupt: true, canReviseGoal: true
    };
    if (result.ok &&
      (record.mode === 'ask' || record.mode === 'act' || record.mode === 'form' || record.mode === 'debug') &&
      record.runKind !== 'observe_only' &&
      this.unifiedAgentLoop
    ) {
      this.deps.store.setSnapshot(runId, this.deps.withRunMessages(nextSnapshot, record));
      await this.unifiedAgentLoop.run({ runId, record, maxSteps: 8 });
      return;
    }
    nextSnapshot = this.deps.withRunMessages(nextSnapshot, record);
    this.deps.store.setSnapshot(runId, nextSnapshot);
  }

  cancelRun(runId: string): { runId: string; status: 'cancelled' } {
    this.unifiedAgentLoop?.abortRun(runId);
    const current = this.deps.store.getSnapshot(runId);
    const record = this.deps.store.getRecord(runId);
    if (record) {
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_CANCELLED,
        payload: { reason: 'user_cancelled' }
      });
    }
    const locale = record?.locale ?? 'zh';
    const msgs = this.deps.initialMessages(runId, record?.task ?? current.runId, locale, {
      includeUserTask: record?.runKind !== 'observe_only',
      includeObserveStatus: record?.runKind === 'observe_only'
    }) ?? [];
    const snapshot: RunSnapshot = {
      ...current,
      status: 'cancelled',
      pendingApproval: undefined,
      messages: [...msgs, this.deps.errorMessage(runId, t('runtime.error.runCancelled', locale), t('runtime.error.userCancelled', locale))],
      streaming: this.deps.streamingStateFromTrace(record?.trace ?? current.trace ?? []),
      trace: record?.trace ?? current.trace
    };
    this.deps.store.setSnapshot(runId, snapshot);
    return { runId, status: 'cancelled' };
  }

  async reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    return this.goalRevision.reviseGoal(input);
  }
}

function shouldRequestActMode(
  input: StartRunInput,
  mode: RunMode,
  actionIntent: string | undefined
): boolean {
  return input.mode === 'ask' &&
    mode === 'ask' &&
    input.runKind !== 'observe_only' &&
    Boolean(actionIntent);
}

function modeSwitchRequestMessage(
  runId: string,
  locale: Locale
): NonNullable<RunSnapshot['messages']>[number] {
  const now = Date.now();
  return {
    id: `${runId}:mode-switch-request`,
    role: 'agent',
    kind: 'recommendation',
    status: 'complete',
    title: t('runtime.modeSwitch.title', locale),
    content: t('runtime.modeSwitch.askToAct', locale),
    createdAt: now,
    updatedAt: now
  };
}

function resolveRunKind(input: StartRunInput, mode: RunMode): NonNullable<RunRecord['runKind']> {
  if (input.runKind) {
    return input.runKind;
  }
  if (mode === 'form') {
    return 'form_assist';
  }
  if (mode === 'debug') {
    return 'diagnose';
  }
  return 'answer';
}
