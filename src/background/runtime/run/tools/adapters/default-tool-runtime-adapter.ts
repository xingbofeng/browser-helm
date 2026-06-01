import type { RuntimeEvent } from '../../../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import { TOOL_NAMES } from '../../../../../shared/constants/tool-names';
import type { ToolRuntimeAdapter } from './tool-runtime-adapter';

const SELF_APPROVAL_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
  TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
  TOOL_NAMES.FILE_READ_DOWNLOAD,
  TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL,
  TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
]);

export class DefaultToolRuntimeAdapter implements ToolRuntimeAdapter {
  supports(_tool: string): boolean {
    return true;
  }

  shouldBypassPolicyApproval(tool: string): boolean {
    return SELF_APPROVAL_TOOL_NAMES.has(tool);
  }

  beforeExecution(_input: ExecuteToolInput, _redactedArgs: unknown): RuntimeEvent[] {
    return [];
  }

  afterExecution(_input: ExecuteToolInput, _result: ToolResult): RuntimeEvent[] {
    return [];
  }

  afterApprovalRequested(_input: ExecuteToolInput, _result: ToolResult): RuntimeEvent[] {
    return [];
  }
}
