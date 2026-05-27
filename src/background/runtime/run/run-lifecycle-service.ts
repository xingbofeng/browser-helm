import type { RunSnapshot, RuntimeEvent, StartRunInput, ReviseGoalInput } from '../../../runtime/runtime-messages';
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
  withRunMessages: (snapshot: RunSnapshot, record: { task: string; trace: RuntimeEvent[]; skipProviderResponse?: boolean }) => RunSnapshot;
  fallbackSnapshotFields: (mode: RunMode, observeResult: ToolResult) => Partial<RunSnapshot>;
  streamingStateFromTrace: (trace: RuntimeEvent[]) => RunSnapshot['streaming'];
  emptyStreamingState: () => NonNullable<RunSnapshot['streaming']>;
  initialMessages: (runId: string, task: string, options: { includeUserTask?: boolean; includeObserveStatus?: boolean }) => NonNullable<RunSnapshot['messages']>;
  errorMessage: (runId: string, title: string, content: string) => NonNullable<RunSnapshot['messages']>[number];
  enrichDiagnostics: (runId: string, record: { mode: RunMode; trace: RuntimeEvent[] }, tabId: number, observeResult: ToolResult, snapshot: RunSnapshot) => Promise<RunSnapshot>;
  scheduleProviderMessage: (runId: string, record: { task: string; mode: RunMode; trace: RuntimeEvent[] }, snapshot: RunSnapshot) => void;
};

export class RunLifecycleService {
  public onDiagnosticsResolved?: (runId: string, enriched: RunSnapshot) => void;

  constructor(private readonly deps: LifecycleDeps) {}

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = this.deps.store.createRunId();
    const resolvedMode = resolveRunMode({
      task: input.task,
      ...(input.mode ? { explicitMode: input.mode } : {})
    });
    const mode = resolvedMode.mode;
    const record = {
      task: input.task,
      mode,
      trace: [] as RuntimeEvent[],
      skipProviderResponse: input.skipProviderResponse ?? false
    };
    this.deps.store.setRecord(runId, record);
    this.deps.store.appendTrace(record, {
      runId, type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: { task: input.task, mode }
    });
    this.deps.store.setSnapshot(runId, {
      runId, mode, status: 'observing',
      classification: resolvedMode.classification,
      modeReason: resolvedMode.reason,
      messages: this.deps.initialMessages(runId, input.task, {
        includeUserTask: input.skipProviderResponse !== true,
        includeObserveStatus: input.skipProviderResponse === true
      }),
      streaming: this.deps.emptyStreamingState(),
      trace: record.trace
    });

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
          ...(this.deps.initialMessages(runId, input.task, {
            includeUserTask: input.skipProviderResponse !== true,
            includeObserveStatus: input.skipProviderResponse === true
          }) ?? []),
          this.deps.errorMessage(runId, '没有可用的活动标签页', 'No active browser tab is available')
        ],
        streaming: this.deps.emptyStreamingState(),
        trace: record.trace
      });
      return { runId };
    }

    (record as Record<string, unknown>).tabId = tabId;
    void this.observeInitial(runId, record as { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[]; skipProviderResponse: boolean }, tabId);
    return { runId };
  }

  async observeInitial(
    runId: string,
    record: { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[]; skipProviderResponse: boolean },
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
        { runId, stepId: `${runId}:observe`, runMode: record.mode }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial observation failed';
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: { code: ERROR_CODES.RUNTIME_UNAVAILABLE, summary: message }
      });
      const msgs = this.deps.initialMessages(runId, record.task, {
        includeUserTask: record.skipProviderResponse !== true,
        includeObserveStatus: record.skipProviderResponse === true
      }) ?? [];
      this.deps.store.setSnapshot(runId, {
        ...this.deps.store.getSnapshot(runId),
        status: 'error', refs: [],
        error: { code: ERROR_CODES.RUNTIME_UNAVAILABLE, message },
        messages: [...msgs, this.deps.errorMessage(runId, '页面观察失败', message)],
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
    record: { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[]; skipProviderResponse: boolean },
    tabId: number,
    result: ToolResult,
    baseSnapshot: RunSnapshot
  ): Promise<void> {
    this.deps.store.setSnapshot(runId, baseSnapshot);
    try {
      let fallback: RunSnapshot = {
        ...baseSnapshot,
        ...this.deps.fallbackSnapshotFields(record.mode, result),
        trace: record.trace,
        messages: this.deps.withRunMessages(baseSnapshot, record).messages,
        streaming: this.deps.streamingStateFromTrace(record.trace),
        canInterrupt: true, canReviseGoal: true
      };
      fallback = await this.maybeAutoFillForm(runId, record, tabId, fallback);
      this.deps.store.setSnapshot(runId, fallback);
      if (!record.skipProviderResponse) {
        this.deps.scheduleProviderMessage(runId, record, fallback);
      }
      void this.deps.enrichDiagnostics(runId, record, tabId, result, baseSnapshot)
        .then((enriched) => {
          const newEvents = (enriched.trace ?? []).slice(record.trace.length);
          for (const event of newEvents) {
            this.deps.store.appendTrace(record, event);
          }
          const current = this.deps.store.getSnapshot(runId);
          const activeProvider = current.streaming?.active === true;
          const next: RunSnapshot = {
            ...current, ...enriched,
            status: activeProvider ? current.status : enriched.status,
            trace: record.trace,
            messages: this.deps.withRunMessages({ ...enriched, messages: current.messages }, record).messages,
            streaming: this.deps.streamingStateFromTrace(record.trace)
          };
          this.deps.store.setSnapshot(runId, next);
          this.onDiagnosticsResolved?.(runId, next);
        }).catch(() => undefined);
    } catch {
      this.deps.store.setSnapshot(runId, { ...baseSnapshot, trace: record.trace, canInterrupt: true, canReviseGoal: true });
    }
  }

  private async maybeAutoFillForm(
    runId: string,
    record: { task: string; mode: RunMode; trace: RuntimeEvent[] },
    tabId: number,
    snapshot: RunSnapshot
  ): Promise<RunSnapshot> {
    if (record.mode !== 'form' || !shouldAutoFillForm(record.task)) {
      return snapshot;
    }

    const fields = snapshot.structuredPageData?.forms.items ?? [];
    if (fields.length === 0) {
      return snapshot;
    }

    const router = this.deps.createToolRouter(tabId);
    const formSummary = snapshot.structuredPageData?.forms.summary ?? '当前页面表单字段';
    const inferArgs = {
      userTask: record.task,
      formSummary,
      fields: fields.map((field) => ({
        refId: field.refId,
        ...(field.label ? { label: field.label } : {}),
        ...(field.name ? { name: field.name } : {}),
        type: field.type,
        ...(typeof field.required === 'boolean' ? { required: field.required } : {}),
        ...(typeof field.disabled === 'boolean' ? { disabled: field.disabled } : {}),
        ...(typeof field.sensitive === 'boolean' ? { sensitive: field.sensitive } : {}),
        ...(field.valuePreview ? { valuePreview: field.valuePreview } : {})
      }))
    };
    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: { tool: TOOL_NAMES.FORM_INFER_FILL_PLAN, argsPreview: inferArgs }
    });
    const inferResult = await router.execute({
      tool: TOOL_NAMES.FORM_INFER_FILL_PLAN,
      args: inferArgs
    }, { runId, stepId: 'auto_form_infer_fill_plan', runMode: record.mode });
    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.FORM_INFER_FILL_PLAN,
        ok: inferResult.ok,
        code: inferResult.code,
        summary: inferResult.summary,
        changedPage: inferResult.changedPage,
        requiresObserve: inferResult.requiresObserve
      }
    });

    const fillTargets = fillTargetsFromPlan(inferResult.data);
    if (!inferResult.ok || fillTargets.length === 0) {
      return {
        ...snapshot,
        toolResult: {
          tool: TOOL_NAMES.FORM_INFER_FILL_PLAN,
          ok: inferResult.ok,
          code: inferResult.code,
          summary: inferResult.summary,
          detail: inferResult.data,
          changedPage: inferResult.changedPage,
          requiresObserve: inferResult.requiresObserve
        },
        trace: record.trace,
        streaming: this.deps.streamingStateFromTrace(record.trace)
      };
    }

    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: { tool: TOOL_NAMES.FORM_FILL_MANY, argsPreview: { fields: fillTargets } }
    });
    const fillResult = await router.execute({
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: { fields: fillTargets }
    }, { runId, stepId: 'auto_form_fill_many', runMode: record.mode });
    this.deps.store.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.FORM_FILL_MANY,
        ok: fillResult.ok,
        code: fillResult.code,
        summary: fillResult.summary,
        changedPage: fillResult.changedPage,
        requiresObserve: fillResult.requiresObserve
      }
    });

    return {
      ...snapshot,
      toolResult: {
        tool: TOOL_NAMES.FORM_FILL_MANY,
        ok: fillResult.ok,
        code: fillResult.code,
        summary: fillResult.summary,
        detail: fillResult.data,
        changedPage: fillResult.changedPage,
        requiresObserve: fillResult.requiresObserve
      },
      trace: record.trace,
      streaming: this.deps.streamingStateFromTrace(record.trace)
    };
  }

  private async handleSimpleFlow(
    runId: string,
    record: { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[]; skipProviderResponse: boolean },
    tabId: number,
    result: ToolResult,
    baseSnapshot: RunSnapshot
  ): Promise<void> {
    let nextSnapshot: RunSnapshot;
    try {
      nextSnapshot = await this.deps.enrichDiagnostics(runId, record, tabId, result, baseSnapshot);
    } catch {
      nextSnapshot = {
        ...baseSnapshot,
        ...this.deps.fallbackSnapshotFields(record.mode, result),
        trace: record.trace,
        messages: this.deps.withRunMessages(baseSnapshot, record).messages,
        streaming: this.deps.streamingStateFromTrace(record.trace),
        canInterrupt: true, canReviseGoal: true
      };
    }
    nextSnapshot = await this.readTruncatedArticleContext(runId, record, tabId, nextSnapshot);
    this.deps.store.setSnapshot(runId, nextSnapshot);
    if (!record.skipProviderResponse) {
      this.deps.scheduleProviderMessage(runId, record, nextSnapshot);
    }
  }

  private async readTruncatedArticleContext(
    runId: string,
    record: { mode: RunMode; trace: RuntimeEvent[]; skipProviderResponse: boolean },
    tabId: number,
    snapshot: RunSnapshot
  ): Promise<RunSnapshot> {
    if (
      record.mode !== 'ask' ||
      record.skipProviderResponse ||
      snapshot.observation?.warnings.includes('VISIBLE_TEXT_TRUNCATED') !== true
    ) {
      return snapshot;
    }

    const router = this.deps.createToolRouter(tabId);
    const chunks: string[] = [];
    let cursor: number | undefined;
    let lastResult: ToolResult | undefined;
    for (let index = 0; index < 3; index += 1) {
      const args = {
        ...(cursor === undefined ? {} : { cursor }),
        maxChars: 12_000,
        includeHeadings: index === 0,
        includeLinks: index === 0,
        linkLimit: 40
      };
      this.deps.store.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: { tool: TOOL_NAMES.PAGE_READ_ARTICLE, argsPreview: args }
      });
      this.deps.store.setSnapshot(runId, {
        ...snapshot,
        status: 'executing_tool',
        trace: record.trace,
        streaming: this.deps.streamingStateFromTrace(record.trace)
      });
      this.deps.store.notifySnapshotUpdated(runId);
      const result = await router.execute(
        { tool: TOOL_NAMES.PAGE_READ_ARTICLE, args },
        { runId, stepId: `${runId}:read_article:${index}`, runMode: record.mode }
      );
      lastResult = result;
      this.deps.store.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: result.ok,
          code: result.code,
          summary: result.summary,
          changedPage: result.changedPage,
          requiresObserve: result.requiresObserve
        }
      });
      if (!result.ok) {
        break;
      }
      const pageRead = readPageReadData(result.data);
      if (!pageRead) {
        break;
      }
      chunks.push(pageRead.text);
      cursor = pageRead.nextCursor;
      if (!pageRead.hasMore || cursor === undefined) {
        break;
      }
    }

    if (!lastResult?.ok || chunks.length === 0) {
      return {
        ...snapshot,
        trace: record.trace,
        streaming: this.deps.streamingStateFromTrace(record.trace)
      };
    }

    const text = chunks.join('\n\n');
    return {
      ...snapshot,
      toolResult: {
        tool: TOOL_NAMES.PAGE_READ_ARTICLE,
        ok: true,
        code: lastResult.code,
        summary: `已读取长页面正文 ${text.length} 字符`,
        detail: {
          data: {
            text,
            chunkCount: chunks.length,
            source: 'article'
          }
        },
        changedPage: false,
        requiresObserve: false
      },
      trace: record.trace,
      streaming: this.deps.streamingStateFromTrace(record.trace)
    };
  }

  cancelRun(runId: string): { runId: string; status: 'cancelled' } {
    const current = this.deps.store.getSnapshot(runId);
    const record = this.deps.store.getRecord(runId);
    if (record) {
      this.deps.store.appendTrace(record, {
        runId, type: TRACE_EVENT_NAMES.RUN_CANCELLED,
        payload: { reason: 'user_cancelled' }
      });
    }
    const msgs = this.deps.initialMessages(runId, record?.task ?? current.runId, {
      includeUserTask: record?.skipProviderResponse !== true,
      includeObserveStatus: record?.skipProviderResponse === true
    }) ?? [];
    const snapshot: RunSnapshot = {
      ...current,
      status: 'cancelled',
      pendingApproval: undefined,
      messages: [...msgs, this.deps.errorMessage(runId, '运行已取消', '用户已取消当前 BrowserHelm run。')],
      streaming: this.deps.streamingStateFromTrace(record?.trace ?? current.trace ?? []),
      trace: record?.trace ?? current.trace
    };
    this.deps.store.setSnapshot(runId, snapshot);
    return { runId, status: 'cancelled' };
  }

  reviseGoal(input: ReviseGoalInput): RunSnapshot {
    const current = this.deps.store.getSnapshot(input.runId);
    const record = this.deps.store.getRecord(input.runId);
    const mode = record?.mode ?? current.mode;
    const goal = initializeGoalState({
      task: input.goal, mode, goal: input.goal,
      ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
    });
    const plan = buildPlanState({
      id: `plan_${input.runId}_revised`, mode, task: input.goal, updatedAt: Date.now()
    });
    const event: RuntimeEvent = {
      runId: input.runId, type: TRACE_EVENT_NAMES.PLAN_UPDATED,
      payload: { goal, plan, reason: 'goal_revised' }
    };
    if (record) this.deps.store.appendTrace(record, event);
    const snapshot: RunSnapshot = {
      ...current, mode, goal, plan,
      canInterrupt: true, canReviseGoal: true,
      trace: record?.trace ?? [...(current.trace ?? []), event]
    };
    this.deps.store.setSnapshot(input.runId, snapshot);
    return snapshot;
  }
}

function shouldAutoFillForm(task: string): boolean {
  return /填写|填入|输入|勾选|选择|设置|fill|type|check|select|set/i.test(task);
}

function fillTargetsFromPlan(data: unknown): Array<{ fieldRefId: string; value: string }> {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { fields?: unknown }).fields)) {
    return [];
  }
  return (data as { fields: unknown[] }).fields.flatMap((field) => {
    if (!field || typeof field !== 'object') {
      return [];
    }
    const record = field as Record<string, unknown>;
    if (
      typeof record.fieldRefId !== 'string' ||
      typeof record.requestedValue !== 'string' ||
      typeof record.skipReason === 'string'
    ) {
      return [];
    }
    return [{ fieldRefId: record.fieldRefId, value: record.requestedValue }];
  });
}

function readPageReadData(data: unknown): {
  text: string;
  hasMore: boolean;
  nextCursor?: number | undefined;
} | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.text !== 'string') {
    return undefined;
  }
  return {
    text: record.text,
    hasMore: record.hasMore === true,
    nextCursor: typeof record.nextCursor === 'number' ? record.nextCursor : undefined
  };
}
