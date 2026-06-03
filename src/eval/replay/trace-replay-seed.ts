import { sanitizeMemoryDetail, sanitizeMemoryText } from '../../agent/memory/memory-write-policy';
import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import type { TraceReplayFrame } from '../../shared/schemas/trace-replay';
import { adaptTraceEventsToReplayFrames } from './replay-event-adapter';

export type TraceReplaySeed = {
  runId: string;
  toolManifestHash: string;
  frames: TraceReplayFrame[];
  modelOutputs: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    rawText: string;
  }>;
  parseRepairs: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    rawText: string;
    errorCode?: string | undefined;
    message?: string | undefined;
    repairAttempt?: number | undefined;
    repairResult?: unknown;
  }>;
  parsedDecisions: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    decision: unknown;
  }>;
  toolCalls: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    tool: string;
    argsPreview: unknown;
  }>;
  toolResults: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    tool: string;
    code?: string | undefined;
    summary: string;
    result: unknown;
  }>;
  errors: Array<{
    traceEventId: string;
    timestamp?: number | undefined;
    errorCode?: string | undefined;
    message: string;
    payload: unknown;
  }>;
};

export function buildTraceReplaySeed(input: {
  runId: string;
  toolManifestHash: string;
  events: RuntimeEvent[];
}): TraceReplaySeed {
  const events = input.events.filter((event) => event.runId === input.runId);
  return {
    runId: input.runId,
    toolManifestHash: sanitizeMemoryText(input.toolManifestHash).value,
    frames: adaptTraceEventsToReplayFrames(events),
    modelOutputs: events.flatMap(modelOutputSeed),
    parseRepairs: events.flatMap(parseRepairSeed),
    parsedDecisions: events.flatMap(parsedDecisionSeed),
    toolCalls: events.flatMap(toolCallSeed),
    toolResults: events.flatMap(toolResultSeed),
    errors: events.flatMap(errorSeed)
  };
}

function modelOutputSeed(event: RuntimeEvent): TraceReplaySeed['modelOutputs'] {
  if (event.type !== TRACE_EVENT_NAMES.MODEL_OUTPUT_RECEIVED) {
    return [];
  }
  const payload = eventPayload(event);
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    rawText: sanitizeMemoryText(stringField(payload, 'rawText') ?? stringField(payload, 'text') ?? '').value
  }];
}

function parseRepairSeed(event: RuntimeEvent): TraceReplaySeed['parseRepairs'] {
  if (event.type !== TRACE_EVENT_NAMES.DECISION_PARSE_FAILED) {
    return [];
  }
  const payload = eventPayload(event);
  const parseError = isRecord(payload.parseError) ? payload.parseError : {};
  const repairAttempt = numberField(payload, 'repairAttempt');
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    rawText: sanitizeMemoryText(stringField(payload, 'rawText') ?? '').value,
    ...(stringField(parseError, 'code') ? { errorCode: stringField(parseError, 'code') } : {}),
    ...(stringField(parseError, 'message') ? { message: sanitizeMemoryText(stringField(parseError, 'message') ?? '').value } : {}),
    ...(repairAttempt === undefined ? {} : { repairAttempt }),
    ...(payload.repairResult === undefined ? {} : { repairResult: sanitizeMemoryDetail(payload.repairResult) })
  }];
}

function parsedDecisionSeed(event: RuntimeEvent): TraceReplaySeed['parsedDecisions'] {
  if (event.type !== TRACE_EVENT_NAMES.MODEL_DECISION) {
    return [];
  }
  const payload = eventPayload(event);
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    decision: sanitizeMemoryDetail(payload.decision ?? payload)
  }];
}

function toolCallSeed(event: RuntimeEvent): TraceReplaySeed['toolCalls'] {
  if (event.type !== TRACE_EVENT_NAMES.TOOL_STARTED) {
    return [];
  }
  const payload = eventPayload(event);
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    tool: stringField(payload, 'tool') ?? 'unknown_tool',
    argsPreview: sanitizeMemoryDetail(payload.argsPreview ?? payload.args)
  }];
}

function toolResultSeed(event: RuntimeEvent): TraceReplaySeed['toolResults'] {
  if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT) {
    return [];
  }
  const payload = eventPayload(event);
  const result = isRecord(payload.result) ? payload.result : payload;
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    tool: stringField(payload, 'tool') ?? 'unknown_tool',
    ...(stringField(result, 'code') ? { code: stringField(result, 'code') } : {}),
    summary: sanitizeMemoryText(stringField(result, 'summary') ?? stringField(payload, 'summary') ?? 'Tool result').value,
    result: sanitizeMemoryDetail(result)
  }];
}

function errorSeed(event: RuntimeEvent): TraceReplaySeed['errors'] {
  if (event.type !== TRACE_EVENT_NAMES.TOOL_FAILED && event.type !== TRACE_EVENT_NAMES.RUN_FAILED) {
    return [];
  }
  const payload = eventPayload(event);
  return [{
    traceEventId: traceEventIdFor(event),
    ...timestampFor(event),
    ...(stringField(payload, 'code') ? { errorCode: stringField(payload, 'code') } : {}),
    message: sanitizeMemoryText(stringField(payload, 'message') ?? event.type).value,
    payload: sanitizeMemoryDetail(payload)
  }];
}

function eventPayload(event: RuntimeEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function traceEventIdFor(event: RuntimeEvent): string {
  const record = event as RuntimeEvent & { id?: unknown };
  return typeof record.id === 'string' && record.id.trim() ? record.id : `${event.runId}:${event.timestamp ?? 'unknown'}`;
}

function timestampFor(event: RuntimeEvent): { timestamp?: number } {
  return typeof event.timestamp === 'number' ? { timestamp: event.timestamp } : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
