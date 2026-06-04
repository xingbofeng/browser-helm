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
import { redactTextForModelContext } from '../../../shared/redaction';
import { AgentLoop } from '../../../agent/loop/agent-loop';
import type { RuntimeCapabilityProbeResult } from '../capability-probe';
import { probeRuntimeCapabilities } from '../capability-probe';

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
  probeRuntimeCapabilities?: ((input: { tabId: number }) => Promise<RuntimeCapabilityProbeResult>) | undefined;
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
  private readonly agentLoop: AgentLoop | undefined;

  constructor(private readonly deps: LifecycleDeps) {
    this.goalRevision = new GoalRevisionService(deps.store);
    if (deps.settingsStore) {
      this.agentLoop = new AgentLoop({
        settingsStore: deps.settingsStore,
        createProviderModelClient: deps.createProviderModelClient,
        getSnapshot: (runId) => deps.store.getSnapshot(runId),
        setSnapshot: (runId, snapshot) => deps.store.setSnapshot(runId, snapshot),
        notifySnapshotUpdated: (runId) => deps.store.notifySnapshotUpdated(runId),
        appendTrace: (record, event) => deps.store.appendTrace(record, event),
        executeTool: deps.executeTool,
        withRunMessages: deps.withRunMessages,
        getToolContracts: (runMode) => {
          const router = deps.createToolRouter(0); // tabId doesn't matter for contract listing
          return router.listToolContracts(runMode);
        }
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
    const record: RunRecord = {
      task: input.task,
      mode,
      trace: [] as RuntimeEvent[],
      runKind,
      locale,
      taskState: {
        goal: input.task,
        completed: [],
        remaining: [input.task],
        filledFieldRefs: [],
        verifiedFieldRefs: [],
        runtimeCompleted: [],
        runtimeFactsOverrideModelNotes: true as const,
        updatedBy: 'runtime' as const,
        updatedAt: Date.now()
      },
      conversationHistory: input.conversationHistory
    };
    this.deps.store.setRecord(runId, record);
    this.deps.store.appendTrace(record, {
      runId, type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        task: redactTextForModelContext(input.task),
        mode,
        ...(input.conversationHistory?.length ? { historyCount: input.conversationHistory.length } : {}),
        ...(input.goal ? { goal: redactTextForModelContext(input.goal) } : {}),
        ...(input.successCriteria ? { successCriteria: input.successCriteria.map(redactTextForModelContext) } : {})
      }
    });
    this.deps.store.setSnapshot(runId, {
      runId, mode, status: 'observing',
      classification: resolvedMode.classification,
      modeReason: resolvedMode.reason,
      goal,
      plan,
      taskState: record.taskState,
      messages: initialRunMessages,
      streaming: this.deps.emptyStreamingState(),
      trace: record.trace
    });

    const tabId = input.tabId ?? (await this.deps.getActiveTabId());
    if (!tabId) {
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: { code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, summary: t('runtime.error.noActiveTab', locale) }
      });
      this.deps.store.setSnapshot(runId, {
        runId, mode, status: 'error', refs: [],
        error: { code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, message: t('runtime.error.noActiveTab', locale) },
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

    record.tabId = tabId;
    const capabilities = await (this.deps.probeRuntimeCapabilities ?? probeRuntimeCapabilities)({ tabId });
    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED,
      payload: {
        capabilities: capabilities.capabilities,
        limitations: capabilities.limitations
      }
    });
    this.deps.store.setSnapshot(runId, {
      ...this.deps.store.getSnapshot(runId),
      capabilities: capabilities.capabilities,
      capabilityLimitations: capabilities.limitations,
      trace: record.trace
    });
    void this.observeInitial(runId, record as RunRecord & { tabId: number }, tabId);
    return { runId };
  }

  async refreshCapabilities(runId: string): Promise<RunSnapshot> {
    const record = this.deps.store.getRecord(runId);
    const current = this.deps.store.getSnapshot(runId);
    if (!record?.tabId) {
      return current;
    }

    const capabilities = await (this.deps.probeRuntimeCapabilities ?? probeRuntimeCapabilities)({
      tabId: record.tabId
    });
    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED,
      payload: {
        capabilities: capabilities.capabilities,
        limitations: capabilities.limitations,
        reason: 'refresh'
      }
    });
    const nextSnapshot: RunSnapshot = {
      ...current,
      capabilities: capabilities.capabilities,
      capabilityLimitations: capabilities.limitations,
      trace: record.trace
    };
    this.deps.store.setSnapshot(runId, nextSnapshot);
    this.deps.store.notifySnapshotUpdated(runId);
    return nextSnapshot;
  }

  async observeInitial(
    runId: string,
    record: RunRecord & { tabId: number },
    tabId: number
  ): Promise<void> {
    await this.deps.settingsStore?.getDomainAdapterSettings?.();
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
          tabId,
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
    const previousSnapshot = this.deps.store.getSnapshot(runId);
    const observedSnapshot = this.deps.snapshotFromObserveResult(runId, record.mode, result, record.trace);
    const baseSnapshot = this.deps.withRunMessages(
      {
        ...previousSnapshot,
        ...observedSnapshot,
        ...(previousSnapshot.goal ?? observedSnapshot.goal
          ? { goal: previousSnapshot.goal ?? observedSnapshot.goal }
          : {}),
        ...(previousSnapshot.plan ?? observedSnapshot.plan
          ? { plan: previousSnapshot.plan ?? observedSnapshot.plan }
          : {}),
        ...(previousSnapshot.taskState ?? observedSnapshot.taskState
          ? { taskState: previousSnapshot.taskState ?? observedSnapshot.taskState }
          : {}),
        ...(previousSnapshot.capabilities ? { capabilities: previousSnapshot.capabilities } : {}),
        ...(previousSnapshot.capabilityLimitations ? { capabilityLimitations: previousSnapshot.capabilityLimitations } : {})
      },
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
      const fallbackFields = this.deps.fallbackSnapshotFields(record.mode, result, record.locale ?? 'zh');
      const fallback: RunSnapshot = {
        ...baseSnapshot,
        ...fallbackFields,
        ...(baseSnapshot.goal ?? fallbackFields.goal
          ? { goal: baseSnapshot.goal ?? fallbackFields.goal }
          : {}),
        ...(baseSnapshot.plan ?? fallbackFields.plan
          ? { plan: baseSnapshot.plan ?? fallbackFields.plan }
          : {}),
        ...(baseSnapshot.capabilities ? { capabilities: baseSnapshot.capabilities } : {}),
        ...(baseSnapshot.capabilityLimitations ? { capabilityLimitations: baseSnapshot.capabilityLimitations } : {}),
        trace: record.trace,
        messages: this.deps.withRunMessages(baseSnapshot, record).messages,
        streaming: this.deps.streamingStateFromTrace(record.trace),
        canInterrupt: true, canReviseGoal: true
      };
      this.deps.store.setSnapshot(runId, fallback);
      if (record.runKind !== 'observe_only' && this.agentLoop) {
        await this.agentLoop.run({ runId, record, maxSteps: 8 });
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
    const fallbackFields = this.deps.fallbackSnapshotFields(record.mode, result, record.locale ?? 'zh');
    let nextSnapshot: RunSnapshot = {
      ...baseSnapshot,
      ...fallbackFields,
      ...(baseSnapshot.goal ?? fallbackFields.goal
        ? { goal: baseSnapshot.goal ?? fallbackFields.goal }
        : {}),
      ...(baseSnapshot.plan ?? fallbackFields.plan
        ? { plan: baseSnapshot.plan ?? fallbackFields.plan }
        : {}),
      ...(baseSnapshot.capabilities ? { capabilities: baseSnapshot.capabilities } : {}),
      ...(baseSnapshot.capabilityLimitations ? { capabilityLimitations: baseSnapshot.capabilityLimitations } : {}),
      trace: record.trace,
      messages: this.deps.withRunMessages(baseSnapshot, record).messages,
      streaming: this.deps.streamingStateFromTrace(record.trace),
      canInterrupt: true, canReviseGoal: true
    };
    if (result.ok &&
      (record.mode === 'ask' || record.mode === 'act' || record.mode === 'form' || record.mode === 'debug' || record.mode === 'full') &&
      record.runKind !== 'observe_only' &&
      this.agentLoop
    ) {
      this.deps.store.setSnapshot(runId, this.deps.withRunMessages(nextSnapshot, record));
      await this.agentLoop.run({ runId, record, maxSteps: 8 });
      return;
    }
    nextSnapshot = this.deps.withRunMessages(nextSnapshot, record);
    this.deps.store.setSnapshot(runId, nextSnapshot);
  }

  cancelRun(runId: string): { runId: string; status: 'cancelled' } {
    this.agentLoop?.abortRun(runId);
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
