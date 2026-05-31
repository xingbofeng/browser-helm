import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import type { RuntimeEvent } from '../../runtime/runtime-messages';
import type { StepSummary } from '../../shared/schemas/session-summary';
import { sanitizeMemoryText } from './memory-write-policy';

export function buildStepSummaries(trace: RuntimeEvent[]): StepSummary[] {
  const startedByTool = new Map<string, { tool: string; summary?: string | undefined }>();
  const summaries: StepSummary[] = [];

  trace.forEach((event) => {
    const payload = eventPayload(event);
    if (event.type === TRACE_EVENT_NAMES.TOOL_STARTED) {
      const tool = stringField(payload, 'tool');
      if (tool) {
        startedByTool.set(tool, {
          tool,
          summary: `Started ${tool}`
        });
      }
      return;
    }
    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT) {
      return;
    }

    const tool = stringField(payload, 'tool');
    const ok = payload.ok === true;
    const summary = stringField(payload, 'summary') ?? `${tool ?? 'tool'} ${ok ? 'succeeded' : 'failed'}`;
    const nextHints = Array.isArray(payload.nextHints)
      ? payload.nextHints.filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0)
      : undefined;

    summaries.push({
      stepId: `${event.runId}:step_${summaries.length + 1}`,
      ...(tool ? { tool } : {}),
      outcome: ok ? 'success' : 'failed',
      summary: sanitizeMemoryText(summary).value,
      ...(nextHints?.length ? { nextHints: nextHints.map((hint) => sanitizeMemoryText(hint).value) } : {}),
      completionEvidence: ok ? [sanitizeMemoryText(summary).value] : []
    });
    if (tool) {
      startedByTool.delete(tool);
    }
  });

  for (const started of startedByTool.values()) {
    summaries.push({
      stepId: `pending:step_${indexOfPending(summaries) + 1}`,
      tool: started.tool,
      outcome: 'skipped',
      summary: started.summary ?? `Started ${started.tool}`,
      completionEvidence: []
    });
  }

  return summaries;
}

function indexOfPending(summaries: StepSummary[]): number {
  return summaries.filter((summary) => summary.outcome === 'skipped').length;
}

function eventPayload(event: RuntimeEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload
    : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
