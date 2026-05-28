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
import type { Locale } from '../../../../../../i18n/types';

export class FormSubmitApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;

  constructor(
    private readonly deps: {
      getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined; locale?: Locale } | undefined;
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
    record: { task: string; mode: RunMode; tabId: number; trace: RuntimeEvent[]; locale?: Locale }
  ): Promise<ToolResult> {
    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);
    const args = isRecord(pendingAction?.args) ? pendingAction.args : {};
    const submitTargetRefId = typeof args.submitTargetRefId === 'string'
      ? args.submitTargetRefId
      : undefined;
    const formRefId = typeof args.formRefId === 'string' ? args.formRefId : undefined;
    const fieldRefIds = readFieldRefIds(args);
    const verifyFailed = args.verifyFailed === true;
    const rpc = this.deps.createContentRpcClient(record.tabId);

    // Re-verify with the same fieldRefIds and submitRefId as the original approval
    const verifyResponse = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_VERIFY,
      fieldRefIds,
      ...(submitTargetRefId ? { submitRefId: submitTargetRefId } : {})
    });
    if (!verifyResponse.ok) {
      const result: ToolResult = {
        ok: false,
        code: verifyResponse.code,
        summary: verifyResponse.message,
        changedPage: false,
        requiresObserve: false,
        error: { message: verifyResponse.message, detail: verifyResponse.detail }
      };
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'error',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(input.tool, result),
        trace: record.trace,
        error: { code: result.code, message: result.summary }
      });
      return result;
    }
    const verifyResult = 'verifyResult' in verifyResponse ? verifyResponse.verifyResult : undefined;
    if (
      verifyResult &&
      typeof verifyResult === 'object' &&
      'submitAvailable' in verifyResult &&
      verifyResult.submitAvailable === false &&
      !verifyFailed
    ) {
      const result: ToolResult = {
        ok: false,
        code: ERROR_CODES.SUBMIT_TARGET_NOT_READY,
        summary: 'Submit target is not ready after re-verification',
        changedPage: false,
        requiresObserve: false,
        error: { message: 'Submit target is not ready after re-verification' }
      };
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'error',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(input.tool, result),
        trace: record.trace,
        error: { code: result.code, message: result.summary }
      });
      return result;
    }
    const grantResponse = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'submit',
      fieldRefIds,
      ...(formRefId ? { formRefId } : {}),
      ...(submitTargetRefId ? { submitTargetRefId } : {}),
      runId: input.runId,
      stepId: `${input.runId}:submit`
    });
    if (!grantResponse.ok || !('actionToken' in grantResponse)) {
      const message = grantResponse.ok ? 'Form submit authorization failed' : grantResponse.message;
      const result: ToolResult = {
        ok: false,
        code: grantResponse.ok ? ERROR_CODES.FORM_ACTION_UNAUTHORIZED : grantResponse.code,
        summary: message,
        changedPage: false,
        requiresObserve: false,
        error: { message, detail: grantResponse.ok ? undefined : grantResponse.detail }
      };
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'error',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(input.tool, result),
        trace: record.trace,
        error: { code: result.code, message: result.summary }
      });
      return result;
    }
    const submitResponse = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
      actionToken: grantResponse.actionToken,
      allowDisabledSubmit: verifyFailed,
      runId: input.runId,
      stepId: `${input.runId}:submit`,
      ...(formRefId ? { formRefId } : {}),
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
      {
        runId: input.runId,
        stepId: `${input.runId}:post_submit_observe`,
        runMode: record.mode,
        ...(record.locale ? { locale: record.locale } : {})
      }
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

function readFieldRefIds(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.fieldRefIds)) {
    return args.fieldRefIds.filter((id): id is string => typeof id === 'string');
  }
  if (!Array.isArray(args.fields)) {
    return [];
  }
  return args.fields.flatMap((field) => {
    if (
      typeof field === 'object' &&
      field !== null &&
      typeof (field as { fieldRefId?: unknown }).fieldRefId === 'string'
    ) {
      return [(field as { fieldRefId: string }).fieldRefId];
    }
    return [];
  });
}
