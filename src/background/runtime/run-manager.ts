import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type {
  ContentRpcRequest,
  ContentRpcResponse
} from '../../page/messaging/content-rpc.schema';
import { ContextBuilder } from '../../agent/context/context-builder';
import { initializeGoalState } from '../../agent/goal/goal-state';
import { AgentLoop } from '../../agent/kernel/agent-loop';
import { DecisionParser } from '../../agent/parser/decision-parser';
import { buildPlanState } from '../../agent/planning/plan-builder';
import {
  buildDebugReport,
  buildFormDoctorFindings
} from '../../agent/report/findings-report';
import { resolveRunMode } from '../../agent/modes/mode-system';
import { InMemoryTraceRecorder } from '../../storage/memory/in-memory-trace-recorder';
import { ChromeContentRpcClient } from '../../page/messaging/content-rpc-client';
import { buildStructuredPageData } from '../../page/structured/structured-page-data';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import {
  APPROVAL_EVENT_NAMES,
  CONTENT_RPC_MESSAGES,
  TRACE_EVENT_NAMES
} from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { Observation } from '../../shared/schemas/observation.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { ApprovalManager } from '../../runtime/approval/approval-manager';
import { PolicyEngine } from '../../agent/policy/policy-engine';
import { RuntimeDiagnosticModelClient } from './runtime-diagnostic-model-client';
import { resolveRuntimeCapabilities } from '../../runtime/capabilities/runtime-capabilities';
import { redactToolArgs } from '../../tools/core/tool-args-redaction';
import { ToolRouter } from '../../tools/core/tool-router';
import {
  approvalRequiredResult,
  userDeniedApprovalResult
} from '../../tools/core/tool-result-factory';
import { createToolRegistry } from '../../tools';
import type {
  DecideApprovalInput,
  ExecuteToolInput,
  RunSnapshot,
  RuntimeEvent,
  StartRunInput
} from '../../runtime/runtime-messages';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { TraceEvent } from '../../shared/schemas/trace.schema';

type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
};

export class RunManager {
  private nextId = 1;
  private readonly approvalManager = new ApprovalManager();
  private readonly policyEngine = new PolicyEngine();
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly records = new Map<
    string,
    {
      mode: RunMode;
      tabId?: number | undefined;
      trace: RuntimeEvent[];
    }
  >();
  private readonly snapshots = new Map<string, RunSnapshot>();

  constructor(private readonly deps: RunManagerDeps = {}) {}

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `run_${this.nextId}`;
    this.nextId += 1;
    const mode = input.mode ?? 'ask';
    const record: {
      mode: RunMode;
      tabId?: number | undefined;
      trace: RuntimeEvent[];
    } = {
      mode,
      trace: []
    };
    this.records.set(runId, record);
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        task: input.task,
        mode
      }
    });
    this.snapshots.set(runId, {
      runId,
      mode,
      status: 'observing',
      trace: record.trace
    });

    const tabId = input.tabId ?? (await this.getActiveTabId());
    if (!tabId) {
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: {
          code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          summary: 'No active browser tab is available'
        }
      });
      this.snapshots.set(runId, {
        runId,
        mode,
        status: 'error',
        refs: [],
        error: {
          code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          message: 'No active browser tab is available'
        },
        trace: record.trace
      });
      return { runId };
    }

    record.tabId = tabId;
    void this.observeInitial(runId, record, tabId);
    return { runId };
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
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

  private async observeInitial(
    runId: string,
    record: {
      mode: RunMode;
      tabId?: number | undefined;
      trace: RuntimeEvent[];
    },
    tabId: number
  ): Promise<void> {
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        args: {}
      }
    });
    const router = this.createToolRouter(tabId);
    let result: ToolResult;
    try {
      result = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId, stepId: `${runId}:observe`, runMode: record.mode }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial observation failed';
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: {
          code: ERROR_CODES.RUNTIME_UNAVAILABLE,
          summary: message
        }
      });
      this.snapshots.set(runId, {
        ...this.getSnapshot(runId),
        status: 'error',
        refs: [],
        error: {
          code: ERROR_CODES.RUNTIME_UNAVAILABLE,
          message
        },
        trace: record.trace
      });
      return;
    }
    if (this.getSnapshot(runId).status === 'cancelled') {
      return;
    }
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve,
        requiresApproval: result.requiresApproval
      }
    });
    const baseSnapshot = this.snapshotFromToolResult(runId, record.mode, result, record.trace);
    if (record.mode === 'form' || record.mode === 'debug') {
      this.snapshots.set(runId, baseSnapshot);
      try {
        this.snapshots.set(runId, {
          ...baseSnapshot,
          ...fallbackV1SnapshotFields(record.mode, result),
          trace: record.trace,
          canInterrupt: true,
          canReviseGoal: true
        });
      } catch {
        this.snapshots.set(runId, {
          ...baseSnapshot,
          trace: record.trace,
          canInterrupt: true,
          canReviseGoal: true
        });
      }
      void this.enrichSnapshotWithAgentDiagnostics(
        runId,
        record,
        tabId,
        result,
        baseSnapshot
      ).then((enriched) => {
        this.snapshots.set(runId, enriched);
      }).catch(() => undefined);
      return;
    }
    let nextSnapshot: RunSnapshot;
    try {
      nextSnapshot = await this.enrichSnapshotWithAgentDiagnostics(
        runId,
        record,
        tabId,
        result,
        baseSnapshot
      );
    } catch {
      nextSnapshot = {
        ...baseSnapshot,
        ...fallbackV1SnapshotFields(record.mode, result),
        trace: record.trace,
        canInterrupt: true,
        canReviseGoal: true
      };
    }
    this.snapshots.set(runId, nextSnapshot);
  }

  private async enrichSnapshotWithAgentDiagnostics(
    runId: string,
    record: {
      mode: RunMode;
      trace: RuntimeEvent[];
    },
    tabId: number,
    observeResult: ToolResult,
    snapshot: RunSnapshot
  ): Promise<RunSnapshot> {
    if (record.mode !== 'form' && record.mode !== 'debug') {
      return snapshot;
    }
    const traceRecorder = new InMemoryTraceRecorder();
    const rpc = new CachedObservationRpcClient(
      this.createContentRpcClient(tabId),
      observeResult
    );
    const agent = new AgentLoop({
      modelClient: new RuntimeDiagnosticModelClient(),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(createToolRegistry(rpc)),
      contextBuilder: new ContextBuilder(),
      traceRecorder
    });

    const result = await withTimeout(agent.run({
      task: snapshot.mode === 'form'
        ? '诊断当前表单状态'
        : snapshot.mode === 'debug'
          ? '检查当前页面健康状态'
          : '观察当前页面并准备诊断',
      mode: record.mode,
      maxSteps: record.mode === 'form' || record.mode === 'debug' ? 3 : 1
    }), 1000);
    if (!result) {
      return {
        ...snapshot,
        ...fallbackV1SnapshotFields(record.mode, observeResult),
        trace: record.trace,
        canInterrupt: true,
        canReviseGoal: true
      };
    }
    const agentTrace = result.trace;
    const v1 = extractV1SnapshotFields(agentTrace);
    record.trace.push(...normalizeAgentTraceEvents(runId, agentTrace));

    return {
      ...snapshot,
      ...v1,
      trace: record.trace,
      canInterrupt: true,
      canReviseGoal: true
    };
  }

  async executeTool(input: ExecuteToolInput): Promise<ToolResult> {
    const record = this.records.get(input.runId);
    const redactedArgs = redactToolArgs(input.tool, input.args);
    if (this.getSnapshot(input.runId).status === 'cancelled') {
      return {
        ok: false,
        code: ERROR_CODES.RUN_CANCELLED,
        summary: 'Run was cancelled by the user',
        changedPage: false,
        requiresObserve: false,
        error: {
          message: 'Run was cancelled by the user'
        }
      };
    }
    if (!record?.tabId) {
      const result = userDeniedApprovalResult('Run is not available for tool execution');
      this.snapshots.set(input.runId, {
        runId: input.runId,
        mode: record?.mode ?? 'ask',
        status: 'error',
        refs: [],
        toolResult: snapshotToolResult(input.tool, result),
        error: {
          code: result.code,
          message: result.summary
        },
        trace: record?.trace ?? []
      });
      return result;
    }

    const router = this.createToolRouter(record.tabId);
    const contract = router.getToolContract(input.tool, record.mode);
    if (contract) {
      const policy = this.policyEngine.evaluate({
        risk: contract.risk,
        wouldRequireApproval: false
      });
      if (!policy.allow && policy.requiresApproval) {
        const result = approvalRequiredResult({
          reason: policy.reason,
          risk: contract.risk,
          actionPreview: `${contract.title} (${input.tool})`
        });
        const request = this.approvalManager.create({
          runId: input.runId,
          stepId: `${input.runId}:${input.tool}`,
          tool: input.tool,
          argsPreview: redactedArgs,
          risk: contract.risk,
          reason: result.approval?.reason ?? result.summary,
          actionPreview: result.approval?.actionPreview
        });
        this.appendTrace(record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
          payload: {
            request,
            summary: `${request.reason}; action was not executed`
          }
        });
        this.snapshots.set(input.runId, {
          ...this.getSnapshot(input.runId),
          status: 'waiting_for_approval',
          toolResult: snapshotToolResult(input.tool, result),
          pendingApproval: request,
          trace: record.trace
        });
        return result;
      }
    }

    this.appendTrace(record, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: input.tool,
        args: redactedArgs
      }
    });
    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: 'executing_tool',
      trace: record.trace
    });

    const result = await router.execute(
      {
        tool: input.tool,
        args: input.args
      },
      {
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        runMode: record.mode
      }
    );
    this.appendTrace(record, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: input.tool,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve,
        requiresApproval: result.requiresApproval
      }
    });

    if (result.requiresApproval) {
      const request = this.approvalManager.create({
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        tool: input.tool,
        argsPreview: redactedArgs,
        risk: result.approval?.risk ?? 'high',
        reason: result.approval?.reason ?? result.summary,
        actionPreview: result.approval?.actionPreview
      });
      this.appendTrace(record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
        payload: {
          request,
          summary: request.reason
        }
      });
      this.snapshots.set(input.runId, {
        ...this.getSnapshot(input.runId),
        status: 'waiting_for_approval',
        toolResult: snapshotToolResult(input.tool, result),
        pendingApproval: request,
        trace: record.trace
      });
      return result;
    }

    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: result.ok ? 'observed' : 'error',
      toolResult: snapshotToolResult(input.tool, result),
      pendingApproval: undefined,
      trace: record.trace,
      ...(result.ok
        ? {}
        : {
            error: {
              code: result.code,
              message: result.error?.message ?? result.summary
            }
          })
    });
    return result;
  }

  decideApproval(input: DecideApprovalInput): Promise<ToolResult> {
    const record = this.records.get(input.runId);
    const decidedAt = Date.now();
    const decision = this.approvalManager.decide({
      requestId: input.requestId,
      decision: input.decision,
      reason: input.reason,
      decidedAt
    });
    if (!decision.ok) {
      return Promise.resolve({
        ok: false,
        code: decision.code,
        summary: decision.message,
        error: {
          message: decision.message
        }
      });
    }

    if (input.decision === 'denied') {
      const result = userDeniedApprovalResult(input.reason ?? 'User denied approval');
      if (record) {
        this.appendTrace(record, {
          runId: input.runId,
          type: APPROVAL_EVENT_NAMES.DENIED,
          payload: {
            requestId: input.requestId,
            reason: input.reason ?? result.summary,
            code: result.code
          }
        });
      }
      this.snapshots.set(input.runId, {
        ...this.getSnapshot(input.runId),
        status: 'failed',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(decision.request.tool, result),
        trace: record?.trace ?? []
      });
      return Promise.resolve(result);
    }

    const result: ToolResult = {
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'Approval recorded; no action was automatically executed in this version.',
      changedPage: false,
      requiresObserve: false
    };
    if (record) {
      this.appendTrace(record, {
        runId: input.runId,
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: {
          requestId: input.requestId,
          reason: result.summary,
          code: result.code
        }
      });
    }
    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: 'observed',
      pendingApproval: undefined,
      toolResult: snapshotToolResult(decision.request.tool, result),
      trace: record?.trace ?? []
    });
    return Promise.resolve(result);
  }

  cancelRun(runId: string): Promise<{ runId: string; status: 'cancelled' }> {
    const current = this.getSnapshot(runId);
    const record = this.records.get(runId);
    if (record) {
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_CANCELLED,
        payload: {
          reason: 'user_cancelled'
        }
      });
    }
    const snapshot: RunSnapshot = {
      ...current,
      status: 'cancelled',
      pendingApproval: undefined,
      trace: record?.trace ?? current.trace
    };
    this.snapshots.set(runId, snapshot);
    return Promise.resolve({
      runId,
      status: 'cancelled'
    });
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

  private createToolRouter(tabId: number): ToolRouter {
    const rpc = this.createContentRpcClient(tabId);
    return new ToolRouter(createToolRegistry(rpc));
  }

  private createContentRpcClient(tabId: number): ContentRpcClient {
    return this.deps.createContentRpcClient?.(tabId) ?? new ChromeContentRpcClient(tabId);
  }

  private async getActiveTabId(): Promise<number | undefined> {
    if (this.deps.getActiveTabId) {
      return this.deps.getActiveTabId();
    }
    if (!globalThis.chrome?.tabs?.query) {
      return undefined;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab?.id;
  }

  private snapshotFromToolResult(
    runId: string,
    mode: RunMode,
    result: ToolResult,
    trace: RuntimeEvent[]
  ): RunSnapshot {
    const toolResult = {
      tool: TOOL_NAMES.PAGE_OBSERVE,
      ok: result.ok,
      code: result.code,
      summary: result.summary
    };

    if (!result.ok) {
      return {
        runId,
        mode,
        status: 'error',
        refs: [],
        toolResult,
        error: {
          code: result.code,
          message: result.error?.message ?? result.summary
        },
        trace
      };
    }

    const observation = result.data as Observation;
    const refs = observation.refSummary;
    const structuredPageData = buildStructuredPageData(observation);
    return {
      runId,
      mode,
      status: refs.length > 0 ? 'observed' : 'empty',
      observation: {
        url: observation.url,
        title: observation.title,
        currentDomain: observation.currentDomain,
        origin: observation.origin,
        visibleTextSummary: observation.visibleTextSummary,
        pageStateSummary: observation.pageStateSummary,
        interactiveCount: refs.length,
        warnings: observation.warnings
      },
      refs,
      structuredPageData,
      toolResult,
      trace
    };
  }

  private appendTrace(
    record: {
      trace: RuntimeEvent[];
    },
    event: RuntimeEvent
  ): void {
    record.trace.push(event);
    for (const listener of this.listeners.get(event.runId) ?? []) {
      listener(event);
    }
  }
}

class CachedObservationRpcClient implements ContentRpcClient {
  constructor(
    private readonly fallback: ContentRpcClient,
    private readonly observeResult: ToolResult
  ) {}

  request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (
      message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE &&
      this.observeResult.ok &&
      typeof this.observeResult.data === 'object' &&
      this.observeResult.data !== null
    ) {
      return Promise.resolve({
        ok: true,
        observation: this.observeResult.data as Observation
      });
    }
    return this.fallback.request(message);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs);
    })
  ]);
}

function fallbackV1SnapshotFields(
  mode: RunMode,
  observeResult: ToolResult
): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'findings'
  | 'debugReport'
> {
  const task = mode === 'form' ? '诊断当前表单状态' : '检查当前页面健康状态';
  const resolvedMode = resolveRunMode({
    task,
    explicitMode: mode
  });
  const capabilities = resolveRuntimeCapabilities({
    hasActiveTab: true,
    shallowDebugAvailable: true
  });
  const goal = initializeGoalState({
    task,
    mode
  });
  const plan = buildPlanState({
    id: `plan_fallback_${Date.now().toString(36)}`,
    mode,
    task,
    updatedAt: Date.now()
  });

  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'findings'
    | 'debugReport'
  > = {
    classification: resolvedMode.classification,
    modeReason: resolvedMode.reason,
    capabilities,
    capabilityLimitations: [],
    goal,
    plan
  };

  if (mode === 'form' && observeResult.ok) {
    const observation = observeResult.data as Observation;
    const formData = readFormDataFromObservation(observation);
    const findings = buildFormDoctorFindings(formData);
    fields.findings = findings;
    fields.debugReport = buildDebugReport({
      title: 'Form Doctor 诊断报告',
      findings,
      recommendations: findings.length > 0 ? ['根据 finding 的 evidence 逐项处理。'] : []
    });
  }
  if (mode === 'debug') {
    fields.debugReport = buildDebugReport({
      title: 'Page Inspector 诊断报告',
      findings: [],
      recommendations: [],
      limitations: ['暂未收集到可汇总的浅层 debug finding']
    });
  }

  return fields;
}

function readFormDataFromObservation(observation: Observation): Parameters<
  typeof buildFormDoctorFindings
>[0] {
  const record =
    typeof observation.formFields === 'object' && observation.formFields !== null
      ? observation.formFields as Record<string, unknown>
      : {};
  return {
    fields: Array.isArray(record.fields) ? record.fields as never : [],
    submit:
      typeof record.submit === 'object' && record.submit !== null
        ? record.submit as never
        : undefined,
    warnings: Array.isArray(record.warnings) ? record.warnings as never : []
  };
}

function extractV1SnapshotFields(trace: TraceEvent[]): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'recovery'
  | 'findings'
  | 'debugReport'
> {
  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'recovery'
    | 'findings'
    | 'debugReport'
  > = {};

  for (const event of trace) {
    if (event.type === TRACE_EVENT_NAMES.TASK_CLASSIFIED) {
      fields.classification = event.payload.classification;
      fields.modeReason = event.payload.classification.reason;
    }
    if (event.type === TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED) {
      fields.capabilities = event.payload.capabilities;
      fields.capabilityLimitations = event.payload.limitations;
    }
    if (event.type === TRACE_EVENT_NAMES.PLAN_UPDATED) {
      fields.plan = event.payload.plan;
      if (event.payload.goal) {
        fields.goal = event.payload.goal;
      }
    }
    if (event.type === TRACE_EVENT_NAMES.RECOVERY_ACTION) {
      fields.recovery = event.payload.recovery;
    }
    if (event.type === TRACE_EVENT_NAMES.FINDINGS_REPORTED) {
      fields.findings = event.payload.findings;
    }
    if (event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED) {
      fields.debugReport = event.payload.report;
    }
  }

  return fields;
}

function normalizeAgentTraceEvents(runId: string, trace: TraceEvent[]): RuntimeEvent[] {
  return trace.map((event) => ({
    ...event,
    runId,
    payload: withAgentRunId(event.payload, event.runId)
  }));
}

function withAgentRunId(payload: unknown, agentRunId: string): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...payload,
      agentRunId
    };
  }
  return {
    value: payload,
    agentRunId
  };
}

function snapshotToolResult(
  tool: string,
  result: ToolResult
): NonNullable<RunSnapshot['toolResult']> {
  return {
    tool,
    ok: result.ok,
    code: result.code,
    summary: result.summary,
    detail: sanitizeToolResultDetail(result),
    changedPage: result.changedPage,
    requiresObserve: result.requiresObserve,
    requiresApproval: result.requiresApproval
  };
}

const sensitiveDetailKeyPattern = /api.?key|password|token|secret|otp|one.?time|text/i;

function sanitizeToolResultDetail(result: ToolResult): unknown {
  return sanitizeDetailValue({
    data: result.data,
    error: result.error,
    approval: result.approval
  }, '');
}

function sanitizeDetailValue(value: unknown, key: string): unknown {
  if (typeof value === 'string') {
    return sensitiveDetailKeyPattern.test(key) ? '[MASKED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetailValue(item, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sensitiveDetailKeyPattern.test(entryKey)
          ? '[MASKED]'
          : sanitizeDetailValue(entryValue, entryKey)
      ])
    );
  }
  return value;
}
