import type { RuntimeEvent } from '../../../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';

export interface ToolRuntimeAdapter {
  supports?(tool: string): boolean;
  shouldBypassPolicyApproval?(tool: string): boolean;
  approvalArgsPreview?(input: ExecuteToolInput, redactedArgs: unknown): unknown;
  beforeExecution(input: ExecuteToolInput, redactedArgs: unknown): RuntimeEvent[];
  afterExecution(input: ExecuteToolInput, result: ToolResult): RuntimeEvent[];
  afterApprovalRequested(input: ExecuteToolInput, result: ToolResult): RuntimeEvent[];
}
