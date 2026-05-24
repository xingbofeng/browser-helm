import type { TraceEvent } from '../../shared/schemas/trace.schema';
import { maskSecrets } from '../../agent/policy/masking';
import type { TraceRecorder } from '../interfaces/trace-recorder';

export class InMemoryTraceRecorder implements TraceRecorder {
  private readonly byRunId = new Map<string, TraceEvent[]>();

  append(event: TraceEvent): void {
    const sanitizedEvent = sanitizeUnknown(event) as TraceEvent;

    const events = this.byRunId.get(sanitizedEvent.runId);
    if (!events) {
      this.byRunId.set(sanitizedEvent.runId, [sanitizedEvent]);
      return;
    }
    events.push(sanitizedEvent);
  }

  list(runId: string): TraceEvent[] {
    return [...(this.byRunId.get(runId) ?? [])];
  }
}

function sanitizeUnknown(input: unknown): unknown {
  if (typeof input === 'string') {
    return maskSecrets(input);
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeUnknown(item));
  }
  if (!isRecord(input)) {
    return input;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    sanitized[key] = sanitizeUnknown(value);
  }
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
