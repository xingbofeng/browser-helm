import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import type { RunSnapshot, RuntimeEvent, ExecuteToolInput } from '../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { ToolRouter } from '../../../../tools/core/tool-router';
import type { RuntimeToolResultSnapshot } from '../../../../runtime/runtime-messages';
import type { ToolRuntimeAdapter } from './adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../shared/constants/event-names';
import { redactToolArgs } from '../../../../tools/core/tool-args-redaction';
import type { approvalRequiredResult } from '../../../../tools/core/tool-result-factory';
import { userDeniedApprovalResult } from '../../../../tools/core/tool-result-factory'; 
import type { approvalRequestForTrace } from '../runtime-event-utils';

import { toolStartedEvent, toolResultEvent, approvalRequiredEvent } from './tool-runtime-events';
import type { ApprovalManager } from '../../../../runtime/approval/approval-manager';

export type ToolExecutionDeps = {
  getSnapshot: (runId: string) => RunSnapshot;
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined } | undefined;
  createToolRouter: (tabId: number) => ToolRouter;
  createContentRpcClient: (tabId: number) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
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

    // Emit post-execution events via adapter
    const afterEvents = adapter.afterExecution(input, result);
    for (const evt of afterEvents) this.deps.appendTrace(record, evt);

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
}
