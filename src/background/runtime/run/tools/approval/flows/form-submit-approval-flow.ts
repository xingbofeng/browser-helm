import type { ContentRpcClient } from '../../../../../../page/messaging/content-rpc-client';
import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import type { RuntimeEvent, ExecuteToolInput, RunSnapshot } from '../../../../../../runtime/runtime-messages';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../../shared/constants/tool-names';
import { TRACE_EVENT_NAMES, APPROVAL_EVENT_NAMES, CONTENT_RPC_MESSAGES } from '../../../../../../shared/constants/event-names';
import { snapshotToolResult, snapshotFromObserveResult } from '../../../run-snapshot-assembler';
import type { ToolApprovalFlow } from './tool-approval-flow';
import type { ToolRouter } from '../../../../../../tools/core/tool-router';
import type { RunMode } from '../../../../../../shared/schemas/tool.schema';

export class FormSubmitApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;

  constructor(
    private readonly deps: {
      getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined } | undefined;
      getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
      deletePendingAction: (requestId: string) => void;
      createContentRpcClient: (tabId: number) => ContentRpcClient;
      createToolRouter: (tabId: number) => ToolRouter;
      appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
      setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
      getSnapshot: (runId: string) => RunSnapshot;
    }
  ) {}

  onApproved(input: { runId: string; requestId: string; tool: string }): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    if (record) {
      this.deps.appendTrace(record, {
        runId: input.runId, type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: { requestId: input.requestId, reason: 'Submit approval granted', code: ERROR_CODES.OK }
      });
    }
    if (!record?.tabId) {
      const result: ToolResult = {
        ok: false, code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        summary: 'Run is not available for approved form submit',
        changedPage: false, requiresObserve: false,
        error: { message: 'Run is not available for approved form submit' }
      };
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId), status: 'error', pendingApproval: undefined,
        toolResult: snapshotToolResult(input.tool, result), trace: record?.trace ?? []
      });
      return Promise.resolve(result);
    }
    return this.executeSubmit(input, { ...record, tabId: record.tabId });
  }

  private async executeSubmit(
    input: { runId: string; requestId: string; tool: string },
    record: { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[] }
  ): Promise<ToolResult> {
    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);
    const args = isRecord(pendingAction?.args) ? pendingAction.args : {};
    const submitTargetRefId = typeof args.submitTargetRefId === 'string'
      ? args.submitTargetRefId
      : undefined;
    const formRefId = typeof args.formRefId === 'string' ? args.formRefId : undefined;
    const rpc = this.deps.createContentRpcClient(record.tabId);
    const submitResponse = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
      ...(submitTargetRefId ? { submitTargetRefId } : {})
    });

    if (!submitResponse.ok) {
      const result: ToolResult = {
        ok: false, code: submitResponse.code, summary: submitResponse.message,
        changedPage: false, requiresObserve: false,
        error: { message: submitResponse.message, detail: submitResponse.detail }
      };
      this.deps.appendTrace(record, {
        runId: input.runId, type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          ...(formRefId ? { formRefId } : {}),
          outcome: 'failure',
          summary: submitResponse.message
        }
      });
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId), status: 'error', pendingApproval: undefined,
        toolResult: snapshotToolResult(input.tool, result), trace: record.trace,
        error: { code: result.code, message: result.summary }
      });
      return result;
    }

    const result: ToolResult = {
      ok: true, code: ERROR_CODES.OK,
      summary: 'Form submit executed after approval; page was observed again.',
      data: { submitResult: 'submitted' }, changedPage: true, requiresObserve: false
    };
    this.deps.appendTrace(record, {
      runId: input.runId, type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
      payload: {
        ...(formRefId ? { formRefId } : {}),
        outcome: 'unknown',
        summary: result.summary
      }
    });
    this.deps.appendTrace(record, {
      runId: input.runId, type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: { tool: TOOL_NAMES.PAGE_OBSERVE, args: { reason: 'post_submit' } }
    });
    const router = this.deps.createToolRouter(record.tabId);
    const observeResult = await router.execute(
      { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
      { runId: input.runId, stepId: `${input.runId}:post_submit_observe`, runMode: record.mode }
    );
    this.deps.appendTrace(record, {
      runId: input.runId, type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: { tool: TOOL_NAMES.PAGE_OBSERVE, ok: observeResult.ok, code: observeResult.code,
        summary: observeResult.summary, changedPage: observeResult.changedPage, requiresObserve: observeResult.requiresObserve }
    });
    const current = this.deps.getSnapshot(input.runId);
    const observedSnapshot = observeResult.ok
      ? snapshotFromObserveResult(input.runId, record.mode, observeResult, record.trace)
      : current;
    this.deps.setSnapshot(input.runId, {
      ...current, ...observedSnapshot,
      status: observeResult.ok ? observedSnapshot.status : 'observed',
      pendingApproval: undefined, toolResult: snapshotToolResult(input.tool, result), trace: record.trace,
      ...(observeResult.ok ? {} : { error: { code: observeResult.code, message: observeResult.error?.message ?? observeResult.summary } })
    });
    return result;
  }

  onDenied(): ToolResult {
    return {
      ok: false, code: ERROR_CODES.SUBMIT_APPROVAL_DENIED,
      summary: 'User denied form submit approval', changedPage: false, requiresObserve: false,
      error: { message: 'User denied form submit approval' }
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
