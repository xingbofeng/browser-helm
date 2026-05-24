import type { TraceEvent } from '../../shared/schemas/trace.schema';

export interface TraceRecorder {
  append(event: TraceEvent): void;
  list(runId: string): TraceEvent[];
}
