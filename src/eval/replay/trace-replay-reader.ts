import { runtimeEventSchema, type RuntimeEvent } from '../../runtime/runtime-messages';
import { adaptTraceEventsToReplayFrames } from './replay-event-adapter';
import type { TraceReplayFrame } from '../../shared/schemas/trace-replay';

export type TraceReplayReadResult = {
  events: RuntimeEvent[];
  frames: TraceReplayFrame[];
  skippedLines: number;
};

export function readTraceReplayJsonl(content: string): TraceReplayReadResult {
  const events: RuntimeEvent[] = [];
  let skippedLines = 0;

  content.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const result = runtimeEventSchema.safeParse(parsed);
      if (result.success) {
        events.push(result.data);
      } else {
        skippedLines += 1;
      }
    } catch {
      skippedLines += 1;
    }
  });

  return {
    events,
    frames: adaptTraceEventsToReplayFrames(events),
    skippedLines
  };
}

