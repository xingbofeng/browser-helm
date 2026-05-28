import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import type { RunSnapshot, RuntimeEvent, ExecuteToolInput } from '../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { ToolRouter } from '../../../../tools/core/tool-router';
import type { RuntimeToolResultSnapshot } from '../../../../runtime/runtime-messages';
import type { ToolRuntimeAdapter } from './adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../shared/constants/event-names';
import { TOOL_NAMES } from '../../../../shared/constants/tool-names';
import { redactToolArgs } from '../../../../tools/core/tool-args-redaction';
import type { approvalRequiredResult } from '../../../../tools/core/tool-result-factory';
import { userDeniedApprovalResult } from '../../../../tools/core/tool-result-factory'; 
import type { approvalRequestForTrace } from '../runtime-event-utils';

import { toolStartedEvent, toolResultEvent, approvalRequiredEvent } from './tool-runtime-events';
import type { ApprovalManager } from '../../../../runtime/approval/approval-manager';
import type { Locale } from '../../../../i18n/types';

export type ToolExecutionDeps = {
  getSnapshot: (runId: string) => RunSnapshot;
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined; locale?: Locale } | undefined;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  createToolRouter: (tabId: number) => ToolRouter;
  createContentRpcClient: (tabId: number) => void;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  setPendingAction: (requestId: string, input: ExecuteToolInput) => void;
  snapshotToolResult: (tool: string, result: ToolResult) => RuntimeToolResultSnapshot;
  adapters?: ToolRuntimeAdapter[];
  adapter?: ToolRuntimeAdapter;
  toolPolicy: { evaluate: (risk: string) => { allow: boolean; requiresApproval: boolean; reason: string; risk: string } };
  approvalManager: ApprovalManager;
  approvalRequestForTrace: typeof approvalRequestForTrace;
  approvalRequiredResultFn: typeof approvalRequiredResult;
};

export class ToolExecutionService {
  constructor(private readonly deps: ToolExecutionDeps) {}

  async execute(input: ExecuteToolInput): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    const redactedArgs = redactToolArgs(input.tool, input.args);

    if (this.deps.getSnapshot(input.runId).status === 'cancelled') {
      return {
        ok: false, code: ERROR_CODES.RUN_CANCELLED,
        summary: 'Run was cancelled by the user',
        changedPage: false, requiresObserve: false,
        error: { message: 'Run was cancelled by the user' }
      };
    }

    if (!record?.tabId) {
      const result = userDeniedApprovalResult('Run is not available for tool execution');
      this.deps.setSnapshot(input.runId, {
        runId: input.runId, mode: record?.mode ?? 'ask', status: 'error', refs: [],
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        error: { code: result.code, message: result.summary },
        trace: record?.trace ?? []
      });
      return result;
    }

    const router = this.deps.createToolRouter(record.tabId);
    const contract = router.getToolContract(input.tool, record.mode);
    const adapter = this.getAdapter(input.tool);
    const approvalArgsPreview = adapter.approvalArgsPreview?.(input, redactedArgs) ?? redactedArgs;

    if (contract && adapter.shouldBypassPolicyApproval?.(input.tool) !== true) {
      const policy = this.deps.toolPolicy.evaluate(contract.risk);
      if (!policy.allow && policy.requiresApproval) {
        const result = this.deps.approvalRequiredResultFn({
          reason: policy.reason,
          risk: contract.risk,
          actionPreview: `${contract.title} (${input.tool})`
        });
        const request = this.deps.approvalManager.create({
          runId: input.runId, stepId: `${input.runId}:${input.tool}`, tool: input.tool,
          argsPreview: approvalArgsPreview, risk: contract.risk,
          reason: result.approval?.reason ?? result.summary,
          actionPreview: result.approval?.actionPreview
        });
        this.deps.appendTrace(record, {
          runId: input.runId, type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
          payload: {
            request: this.deps.approvalRequestForTrace(request),
            summary: `${request.reason}; action was not executed`
          }
        });
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_approval',
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          pendingApproval: request,
          trace: record.trace
        });
        this.deps.setPendingAction(request.id, input);
        return result;
      }
    }

    const beforeEvents = adapter.beforeExecution(input, redactedArgs);
    this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, redactedArgs));
    for (const evt of beforeEvents) this.deps.appendTrace(record, evt);

    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: 'executing_tool',
      trace: record.trace
    });

    const result = await router.execute(
      { tool: input.tool, args: input.args },
      { runId: input.runId, stepId: `${input.runId}:${input.tool}`, runMode: record.mode }
    );

    // Emit result event
    this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, result));
    if (input.tool === TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH) {
      const report = this.deps.getSnapshot(input.runId).debugReport;
      if (report) {
        this.deps.appendTrace(record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED,
          payload: { report }
        });
      }
    }

    // Emit post-execution events via adapter
    const afterEvents = adapter.afterExecution(input, result);
    for (const evt of afterEvents) this.deps.appendTrace(record, evt);

    if (!result.ok && await this.handleRecovery(input, record, router, result, contract)) {
      return result;
    }

    // Handle requiresApproval from tool result
    if (result.requiresApproval) {
      const request = this.deps.approvalManager.create({
        runId: input.runId, stepId: `${input.runId}:${input.tool}`, tool: input.tool,
        argsPreview: approvalArgsPreview, risk: result.approval?.risk ?? 'high',
        reason: result.approval?.reason ?? result.summary,
        actionPreview: result.approval?.actionPreview
      });
      const approvalEvents = adapter.afterApprovalRequested(input, result);
      for (const evt of approvalEvents) this.deps.appendTrace(record, evt);
      this.deps.appendTrace(record, approvalRequiredEvent(input.runId, request, request.reason));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'waiting_for_approval',
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        pendingApproval: request,
        trace: record.trace
      });
      this.deps.setPendingAction(request.id, input);
      return result;
    }

    // Normal result — success or error
    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: result.ok ? 'observed' : 'error',
      toolResult: this.deps.snapshotToolResult(input.tool, result),
      pendingApproval: undefined,
      trace: record.trace,
      ...(result.ok ? {} : {
        error: { code: result.code, message: result.error?.message ?? result.summary }
      })
    });

    return result;
  }

  private getAdapter(tool: string): ToolRuntimeAdapter {
    const adapters = this.deps.adapters ?? (this.deps.adapter ? [this.deps.adapter] : []);
    const adapter = adapters.find((candidate) => candidate.supports?.(tool) === true) ??
      adapters.at(-1);
    if (!adapter) {
      throw new Error('ToolExecutionService requires at least one tool runtime adapter');
    }
    return adapter;
  }

  private async handleRecovery(
    input: ExecuteToolInput,
    record: NonNullable<ReturnType<ToolExecutionDeps['getRecord']>>,
    router: ToolRouter,
    result: ToolResult,
    contract: { argsSchema?: unknown } | undefined
  ): Promise<boolean> {
    if (result.code === ERROR_CODES.REF_STALE || result.code === ERROR_CODES.PAGE_CHANGED) {
      const recovery = recoveryState('re_observe', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      this.deps.appendTrace(record, toolStartedEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, { reason: 're_observe' }));
      const observeResult = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId: input.runId, stepId: `${input.runId}:recovery_observe`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, observeResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'observed',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        trace: record.trace
      });
      return true;
    }

    if (result.code === ERROR_CODES.TOOL_ARGS_INVALID) {
      const recovery = recoveryState('repair_tool_args', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      const repairedArgs = repairArgs(input.args, contract?.argsSchema);
      if (!repairedArgs) {
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_user',
          canReviseGoal: true,
          recovery: { ...recovery, limitation: 'Tool arguments could not be repaired deterministically' },
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          trace: record.trace
        });
        return true;
      }
      this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, { recovery: 'repair_tool_args', args: redactToolArgs(input.tool, repairedArgs) }));
      const retryResult = await router.execute(
        { tool: input.tool, args: repairedArgs },
        { runId: input.runId, stepId: `${input.runId}:${input.tool}:recovery_retry`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, retryResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: retryResult.ok ? 'observed' : 'waiting_for_user',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, retryResult),
        trace: record.trace
      });
      return true;
    }

    if (result.code === ERROR_CODES.ELEMENT_NOT_FOUND) {
      const recovery = recoveryState('find_alternative_ref', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      this.deps.appendTrace(record, toolStartedEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, { reason: 'find_alternative_ref' }));
      const observeResult = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId: input.runId, stepId: `${input.runId}:recovery_observe`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, observeResult));
      const alternative = findAlternativeRef(input.args, observeResult.data);
      if (!alternative) {
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_user',
          canReviseGoal: true,
          recovery: { ...recovery, limitation: 'No deterministic alternative ref candidate found' },
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          trace: record.trace
        });
        return true;
      }
      const retryArgs = { ...(input.args), refId: alternative.refId };
      this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, { recovery: 'find_alternative_ref', args: redactToolArgs(input.tool, retryArgs) }));
      const retryResult = await router.execute(
        { tool: input.tool, args: retryArgs },
        { runId: input.runId, stepId: `${input.runId}:${input.tool}:recovery_retry`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, retryResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: retryResult.ok ? 'observed' : 'waiting_for_user',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, retryResult),
        trace: record.trace
      });
      return true;
    }

    return false;
  }
}

function recoveryState(type: 're_observe' | 'repair_tool_args' | 'find_alternative_ref', reason: string) {
  return { action: { type, reason }, attempts: 1, budgetRemaining: 0 };
}

function repairArgs(args: unknown, argsSchema: unknown): Record<string, unknown> | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined;
  const properties = typeof argsSchema === 'object' && argsSchema !== null
    ? (argsSchema as { properties?: Record<string, { type?: string }> }).properties
    : undefined;
  if (!properties) return undefined;
  const repaired: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  let changed = false;
  for (const [key, spec] of Object.entries(properties)) {
    const value = repaired[key];
    if (spec.type === 'integer' && typeof value === 'string' && /^-?\d+$/u.test(value)) {
      repaired[key] = Number.parseInt(value, 10);
      changed = true;
    }
    if (spec.type === 'boolean' && typeof value === 'string' && /^(true|false)$/iu.test(value)) {
      repaired[key] = value.toLowerCase() === 'true';
      changed = true;
    }
  }
  return changed ? repaired : undefined;
}

function findAlternativeRef(args: unknown, data: unknown): { refId: string } | undefined {
  const source = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {};
  const oldRef = typeof source.refId === 'string' ? source.refId : undefined;
  const role = typeof source.role === 'string' ? source.role : undefined;
  const name = typeof source.name === 'string' ? source.name : undefined;
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const refs = Array.isArray(record.refSummary) ? record.refSummary : [];
  for (const item of refs) {
    if (typeof item !== 'object' || item === null) continue;
    const ref = item as Record<string, unknown>;
    if (typeof ref.refId !== 'string') continue;
    if (
      ref.refId !== oldRef &&
      ref.visible !== false &&
      (!role || ref.role === role) &&
      (!name || ref.name === name)
    ) {
      return { refId: ref.refId };
    }
  }
  return undefined;
}
