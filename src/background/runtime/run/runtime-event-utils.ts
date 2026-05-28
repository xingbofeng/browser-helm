import type { RuntimeEvent, RuntimeEventType } from '../../../runtime/runtime-messages';
import type { ApprovalAuditRequest, ApprovalRequest } from '../../../shared/schemas/approval.schema';
import { maskProviderSecret, sanitizeSensitiveDetail } from '../../../shared/redaction';

type NormalizableTraceEvent = {
  runId: string;
  type: RuntimeEventType | (string & {});
  payload?: unknown;
  [key: string]: unknown;
};

/**
 * Type guard for plain objects (not null, not array).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a non-empty string, or undefined.
 */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Extracts the numeric timestamp from an event, if present.
 */
export function eventTimestamp(event: RuntimeEvent): number | undefined {
  const record = event as RuntimeEvent & { timestamp?: unknown };
  return typeof record.timestamp === 'number' ? record.timestamp : undefined;
}

/**
 * Finds the last event of a given type in a trace.
 */
export function lastEvent(trace: RuntimeEvent[], type: string): RuntimeEvent | undefined {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    if (trace[index]?.type === type) {
      return trace[index];
    }
  }
  return undefined;
}

/**
 * Extracts payload as a record, returning an empty object for non-objects.
 */
export function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

/**
 * Extracts a non-empty trimmed string from a payload value, masking provider secrets.
 */
export function stringPayload(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? maskProviderSecret(value) : undefined;
}

/**
 * Extracts a finite number from a payload value.
 */
export function numberPayload(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Returns a human-readable summary of a payload, masking secrets.
 */
export function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'stream_failed';
  }
  const record = payload as Record<string, unknown>;
  return typeof record.message === 'string'
    ? maskProviderSecret(record.message)
    : 'stream_failed';
}

/**
 * Returns true if `event` occurred at or after `reference`.
 */
export function isEventAfter(event: RuntimeEvent | undefined, reference: RuntimeEvent | undefined): boolean {
  if (!event || !reference) {
    return false;
  }
  return (eventTimestamp(event) ?? 0) >= (eventTimestamp(reference) ?? 0);
}

/**
 * Races a promise against a timeout, returning undefined if it times out.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs);
    })
  ]);
}

/**
 * Normalizes agent trace events into runtime events, tagging each with the runId
 * and embedding the original agent runId into the payload.
 */
export function normalizeAgentTraceEvents(runId: string, trace: NormalizableTraceEvent[]): RuntimeEvent[] {
  return trace.map((event) => ({
    ...event,
    runId,
    payload: withAgentRunId(event.payload, event.runId)
  }));
}

function withAgentRunId(payload: unknown, agentRunId: string): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      agentRunId
    };
  }
  return {
    value: payload,
    agentRunId
  };
}

/**
 * Redacts `valuePreview` fields in approval args for trace recording.
 * Also applies sanitizeSensitiveDetail for broader redaction coverage.
 */
export function approvalRequestForTrace(request: ApprovalRequest): ApprovalAuditRequest;
export function approvalRequestForTrace<T extends { argsPreview: unknown }>(request: T): Omit<T, 'argsPreview'> & { argsPreview: unknown };
export function approvalRequestForTrace<T extends { argsPreview: unknown }>(
  request: T
): Omit<T, 'argsPreview'> & { argsPreview: unknown } {
  return {
    ...request,
    argsPreview: sanitizeSensitiveDetail(redactApprovalArgsPreview(request.argsPreview))
  };
}

/**
 * Recursively redacts `valuePreview` keys inside `fields` arrays.
 */
export function redactApprovalArgsPreview(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactApprovalArgsPreview);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (key === 'fields' && Array.isArray(entryValue)) {
        return [
          key,
          entryValue.map((field) =>
            isRecord(field) && 'valuePreview' in field
              ? { ...field, valuePreview: '******' }
              : redactApprovalArgsPreview(field)
          )
        ];
      }
      return [key, redactApprovalArgsPreview(entryValue)];
    })
  );
}
