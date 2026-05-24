import type {
  ToolResult,
  ToolRisk
} from '../../shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../shared/constants/error-codes';

export function successToolResult(
  code: string,
  summary: string,
  data?: unknown
): ToolResult {
  return {
    ok: true,
    code,
    summary,
    data
  };
}

export function failedToolResult(
  code: string,
  message: string,
  retryable = false
): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: {
      message,
      detail: {
        retryable
      }
    }
  };
}

export function approvalRequiredResult(input: {
  reason: string;
  risk: ToolRisk;
  actionPreview?: string;
}): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.APPROVAL_REQUIRED,
    summary: 'Requires approval before execution',
    requiresApproval: true,
    approval: {
      reason: input.reason,
      risk: input.risk,
      actionPreview: input.actionPreview
    }
  };
}

export function userDeniedApprovalResult(
  reason = 'User denied approval'
): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.USER_DENIED_APPROVAL,
    summary: reason,
    changedPage: false,
    requiresObserve: false,
    error: {
      message: reason,
      detail: {
        retryable: false
      }
    }
  };
}
