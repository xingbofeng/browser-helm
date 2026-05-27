import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';

export interface ToolApprovalFlow {
  readonly handlesApprovedSideEffects?: boolean;
  onApproved(input: { runId: string; requestId: string; tool: string }): Promise<ToolResult>;
  onDenied(input: { runId: string; requestId: string; tool: string }): ToolResult;
}
