import type { RuntimeEvent } from '../../../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import type { ToolRuntimeAdapter } from './tool-runtime-adapter';

export class DefaultToolRuntimeAdapter implements ToolRuntimeAdapter {
  supports(_tool: string): boolean {
    return true;
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
