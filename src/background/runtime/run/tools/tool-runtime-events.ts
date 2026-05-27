import type { RuntimeEvent } from '../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import { TRACE_EVENT_NAMES } from '../../../../shared/constants/event-names';
import { approvalRequestForTrace } from '../runtime-event-utils';

export function toolStartedEvent(runId: string, tool: string, redactedArgs: unknown): RuntimeEvent {
  return {
    runId,
    type: TRACE_EVENT_NAMES.TOOL_STARTED,
    payload: { tool, args: redactedArgs }
  };
}

export function toolResultEvent(runId: string, tool: string, result: ToolResult): RuntimeEvent {
  return {
    runId,
    type: TRACE_EVENT_NAMES.TOOL_RESULT,
    payload: {
      tool,
      ok: result.ok,
      code: result.code,
      summary: result.summary,
      changedPage: result.changedPage,
      requiresObserve: result.requiresObserve,
      requiresApproval: result.requiresApproval
    }
  };
}

export function approvalRequiredEvent(runId: string, request: { argsPreview: unknown }, summary: string): RuntimeEvent {
  return {
    runId,
    type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
    payload: {
      request: approvalRequestForTrace(request),
      summary
    }
  };
}
