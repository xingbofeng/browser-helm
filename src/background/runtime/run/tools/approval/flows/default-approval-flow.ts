import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import type { ExecuteToolInput } from '../../../../../../runtime/runtime-messages';
import type { ToolApprovalFlow } from './tool-approval-flow';

export class DefaultApprovalFlow implements ToolApprovalFlow {
  onApproved(): Promise<ToolResult> {
    return Promise.resolve({
      ok: true, code: ERROR_CODES.OK,
      summary: 'Approval recorded; no action was automatically executed.',
      changedPage: false, requiresObserve: false
    });
  }
  onDenied(): ToolResult {
    return {
      ok: false, code: ERROR_CODES.USER_DENIED_APPROVAL,
      summary: 'User denied approval', changedPage: false, requiresObserve: false,
      error: { message: 'User denied approval' }
    };
  }
}

export class ExecutePendingActionApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;

  constructor(
    private readonly deps: {
      getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
      deletePendingAction: (requestId: string) => void;
      executeTool: (input: ExecuteToolInput) => Promise<ToolResult>;
    }
  ) {}

  async onApproved(input: { requestId: string }): Promise<ToolResult> {
    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);
    if (!pendingAction) {
      return {
        ok: false,
        code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        summary: 'Approved action is no longer available for execution.',
        changedPage: false,
        requiresObserve: false,
        error: { message: 'Approved action is no longer available for execution.' }
      };
    }
    return await this.deps.executeTool({
      ...pendingAction,
      source: 'runtime'
    });
  }
  onDenied(): ToolResult {
    return {
      ok: false, code: ERROR_CODES.USER_DENIED_APPROVAL,
      summary: 'User denied approval', changedPage: false, requiresObserve: false,
      error: { message: 'User denied approval' }
    };
  }
}
