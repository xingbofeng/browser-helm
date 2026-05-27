import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import type { ToolApprovalFlow } from './tool-approval-flow';

export class DefaultApprovalFlow implements ToolApprovalFlow {
  onApproved(): Promise<ToolResult> {
    return Promise.resolve({
      ok: true, code: ERROR_CODES.OK,
      summary: 'Approval recorded; no action was automatically executed in this version.',
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
