import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { traceReplayFrameSchema, type TraceReplayFrame } from '../../shared/schemas/trace-replay';
import { sanitizeMemoryDetail, sanitizeMemoryText } from '../../agent/memory/memory-write-policy';

export function adaptTraceEventsToReplayFrames(events: RuntimeEvent[]): TraceReplayFrame[] {
  return events.flatMap((event, index) => {
    const frame = adaptTraceEvent(event, index);
    return frame ? [traceReplayFrameSchema.parse(frame)] : [];
  });
}

function adaptTraceEvent(event: RuntimeEvent, index: number): TraceReplayFrame | undefined {
  const payload = eventPayload(event);
  const traceEventId = traceEventIdFor(event, index);
  if (event.type === TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED) {
    const rawText = stringField(payload, 'rawText') ?? stringField(payload, 'text') ?? '';
    return {
      traceEventId,
      kind: 'model_output',
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      summary: truncate(`Model output: ${sanitizeMemoryText(rawText).value}`, 240),
      payload: { rawText: sanitizeMemoryText(rawText).value }
    };
  }
  if (event.type === TRACE_EVENT_NAMES.MODEL_DECISION) {
    const decision = payload.decision ?? payload;
    return {
      traceEventId,
      kind: 'parsed_decision',
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      summary: `Parsed decision: ${decisionType(decision)}`,
      payload: sanitizeMemoryDetail(decision)
    };
  }
  if (event.type === TRACE_EVENT_NAMES.TOOL_STARTED) {
    const tool = stringField(payload, 'tool') ?? 'unknown_tool';
    return {
      traceEventId,
      kind: 'tool_call',
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      summary: `Tool call: ${tool}`,
      payload: {
        tool,
        args: sanitizeMemoryDetail(payload.args ?? payload.argsPreview)
      }
    };
  }
  if (event.type === TRACE_EVENT_NAMES.TOOL_RESULT) {
    const tool = stringField(payload, 'tool') ?? 'unknown_tool';
    const result = isRecord(payload.result) ? payload.result : payload;
    const code = stringField(result, 'code') ?? stringField(payload, 'code');
    const summary = stringField(result, 'summary') ?? stringField(payload, 'summary') ?? 'Tool result';
    return {
      traceEventId,
      kind: 'tool_result',
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      summary: `${tool}: ${sanitizeMemoryText(summary).value}`,
      ...(code ? { errorCode: code } : {}),
      payload: {
        tool,
        result: sanitizeMemoryDetail(result)
      }
    };
  }
  if (event.type === TRACE_EVENT_NAMES.DECISION_PARSE_FAILED || event.type === TRACE_EVENT_NAMES.TOOL_FAILED || event.type === TRACE_EVENT_NAMES.RUN_FAILED) {
    const code = stringField(payload, 'code') ?? stringField(isRecord(payload.parseError) ? payload.parseError : {}, 'code');
    const message = stringField(payload, 'message') ??
      stringField(payload, 'summary') ??
      stringField(isRecord(payload.parseError) ? payload.parseError : {}, 'message') ??
      event.type;
    return {
      traceEventId,
      kind: 'error',
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      summary: sanitizeMemoryText(message).value,
      ...(code ? { errorCode: code } : {}),
      payload: sanitizeMemoryDetail(payload)
    };
  }
  return undefined;
}

function eventPayload(event: RuntimeEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function traceEventIdFor(event: RuntimeEvent, index: number): string {
  const record = event as RuntimeEvent & { id?: unknown };
  return typeof record.id === 'string' && record.id.trim() ? record.id : `${event.runId}:${index}`;
}

function decisionType(value: unknown): string {
  return isRecord(value) && typeof value.type === 'string' ? value.type : 'unknown';
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value;
}

