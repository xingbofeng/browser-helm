import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';

export type TaskVerificationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      tool: string;
    };

const MUTATING_EVIDENCE_TOOLS = new Set<string>([
  TOOL_NAMES.ACTION_CLICK,
  TOOL_NAMES.FORM_FILL_FIELD,
  TOOL_NAMES.FORM_FILL_MANY,
  TOOL_NAMES.POINTER_CLICK,
  TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
  TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
]);

export function verifyTaskCompletionBeforeFinish(
  trace: RuntimeEvent[] | undefined
): TaskVerificationResult {
  const events = trace ?? [];
  for (const [index, event] of events.entries()) {
    if (event.type === TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT) {
      if (!hasSubsequentSuccessfulObservation(events, index)) {
        return {
          ok: false,
          tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
          reason: 'Form submit result has no post-submit page observation evidence'
        };
      }
      continue;
    }

    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT || !isRecord(event.payload)) {
      continue;
    }
    const tool = stringField(event.payload, 'tool');
    if (!tool || event.payload.ok !== true) {
      continue;
    }
    if (
      tool === TOOL_NAMES.FLOW_RUN_WITH_APPROVAL &&
      !hasSubsequentSuccessfulWorkflowScore(events, index)
    ) {
      return {
        ok: false,
        tool,
        reason: 'Workflow replay has no postcondition score evidence'
      };
    }
    if (
      event.payload.requiresObserve === true &&
      !hasSubsequentSuccessfulObservation(events, index)
    ) {
      return {
        ok: false,
        tool,
        reason: `${tool} requires a follow-up page observation before finishing`
      };
    }
    if (!MUTATING_EVIDENCE_TOOLS.has(tool)) {
      continue;
    }
    if (event.payload.changedPage !== true) {
      return {
        ok: false,
        tool,
        reason: `${tool} reported success without page change evidence`
      };
    }
  }
  return { ok: true };
}

function hasSubsequentSuccessfulObservation(events: RuntimeEvent[], index: number): boolean {
  return events.slice(index + 1).some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === TOOL_NAMES.PAGE_OBSERVE &&
    event.payload.ok === true
  );
}

function hasSubsequentSuccessfulWorkflowScore(events: RuntimeEvent[], index: number): boolean {
  return events.slice(index + 1).some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    isRecord(event.payload) &&
    event.payload.tool === TOOL_NAMES.FLOW_SCORE &&
    event.payload.ok === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
