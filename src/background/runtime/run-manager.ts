import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ChromeContentRpcClient } from '../../page/messaging/content-rpc-client';
import { buildStructuredPageData } from '../../page/structured/structured-page-data';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES, TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { Observation } from '../../shared/schemas/observation.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { ApprovalManager } from '../../runtime/approval/approval-manager';
import { redactToolArgs } from '../../tools/core/tool-args-redaction';
import { ToolRouter } from '../../tools/core/tool-router';
import { userDeniedApprovalResult } from '../../tools/core/tool-result-factory';
import { createToolRegistry } from '../../tools';
import type {
  DecideApprovalInput,
  ExecuteToolInput,
  RunSnapshot,
  RuntimeEvent,
  StartRunInput
} from '../../runtime/runtime-messages';
import type { RunMode } from '../../shared/schemas/tool.schema';

type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
};

export class RunManager {
  private nextId = 1;
  private readonly approvalManager = new ApprovalManager();
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
    this.snapshots.set(
      runId,
      this.snapshotFromToolResult(runId, record.mode, result, record.trace)
    );
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

    const router = this.createToolRouter(record.tabId);
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
      summary: 'Approval approved; run can resume',
      changedPage: false,
      requiresObserve: false
    };
    if (record) {
      this.appendTrace(record, {
        runId: input.runId,
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: {
          requestId: input.requestId,
          reason: 'Approval approved',
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
