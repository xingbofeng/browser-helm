import type { ToolSpec } from '../src/tools/core/tool-spec';
import { TOOL_NAMES } from '../src/shared/constants/tool-names';

const EXECUTE_PENDING_APPROVAL_TOOLS = new Set<string>([
  TOOL_NAMES.CDP_ATTACH,
  TOOL_NAMES.ACTION_CLICK,
  TOOL_NAMES.POINTER_CLICK
]);

const CUSTOM_APPROVAL_FLOW_TOOLS = new Set<string>([
  TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
  TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
  TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
  TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
]);

export function validateApprovalBehaviorContracts(
  tools: Pick<ToolSpec<unknown, unknown>, 'name' | 'risk' | 'requiresApproval' | 'approvalBehavior'>[]
): string[] {
  const errors: string[] = [];

  for (const tool of tools) {
    const approvalGated = tool.requiresApproval ?? tool.risk === 'high';
    if (!approvalGated) {
      continue;
    }
    if (!tool.approvalBehavior) {
      errors.push(`Approval-gated tool ${tool.name} must declare approvalBehavior.`);
      continue;
    }
    if (
      tool.approvalBehavior === 'execute_pending_action' &&
      !EXECUTE_PENDING_APPROVAL_TOOLS.has(tool.name)
    ) {
      errors.push(`Tool ${tool.name} declares execute_pending_action but is not registered for execute-pending approval.`);
    }
    if (
      tool.approvalBehavior === 'custom_flow' &&
      !CUSTOM_APPROVAL_FLOW_TOOLS.has(tool.name)
    ) {
      errors.push(`Tool ${tool.name} declares custom_flow but is not registered for custom approval handling.`);
    }
  }

  return errors;
}
