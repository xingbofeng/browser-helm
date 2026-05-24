import type {
  ToolResult,
  ToolRisk
} from '../../shared/schemas/tool-result.schema';

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
    code: 'APPROVAL_REQUIRED',
    summary: 'Requires approval before execution',
    requiresApproval: true,
    approval: {
      reason: input.reason,
      risk: input.risk,
      actionPreview: input.actionPreview
    }
  };
}
