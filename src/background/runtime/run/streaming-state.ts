import type { StreamingState } from '../../../shared/schemas/agent-message.schema';
import type { RuntimeEvent } from '../../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../shared/constants/event-names';
import {
  lastEvent,
  payloadRecord,
  stringPayload,
  numberPayload,
  payloadSummary,
  isEventAfter,
  eventTimestamp
} from './runtime-event-utils';

/**
 * Returns an empty streaming state (no streaming activity).
 */
export function emptyStreamingState(): StreamingState {
  return {
    enabled: true,
    active: false,
    chunkCount: 0,
    fallbackUsed: false
  };
}

/**
 * Derives streaming state from runtime trace events.
 */
export function streamingStateFromTrace(trace: RuntimeEvent[]): StreamingState {
  const streamStarted = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_STARTED);
  const streamFinished = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED);
  const fallbackStarted = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED);
  const fallbackFinished = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED);
  const failed = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FAILED);
  const cancelled = lastEvent(trace, TRACE_EVENT_NAMES.RUN_CANCELLED);
  const deltaEvents = trace.filter((event) =>
    event.type === TRACE_EVENT_NAMES.MODEL_STREAM_DELTA
  );
  const startedPayload = payloadRecord(streamStarted?.payload);
  const finishedPayload = payloadRecord(streamFinished?.payload);
  const fallbackPayload = payloadRecord(fallbackStarted?.payload);
  const failedPayload = payloadRecord(failed?.payload);
  const lastDeltaPayload = payloadRecord(deltaEvents.at(-1)?.payload);
  const chunkCount = numberPayload(finishedPayload.chunkCount) ??
    numberPayload(failedPayload.chunkCount) ??
    numberPayload(lastDeltaPayload.chunkCount) ??
    deltaEvents.length;
  const provider = stringPayload(startedPayload.provider);
  const model = stringPayload(startedPayload.model) ?? stringPayload(finishedPayload.model);
  const finalText = stringPayload(finishedPayload.finalPreview);
  const fallbackReason = stringPayload(fallbackPayload.reason) ?? payloadSummary(failed?.payload);
  const cancelledAfterStart = isEventAfter(cancelled, streamStarted);
  return {
    enabled: startedPayload.streamingEnabled !== false,
    active: Boolean(streamStarted && !streamFinished && !failed && !fallbackFinished && !cancelledAfterStart),
    chunkCount,
    fallbackUsed: Boolean(fallbackStarted || fallbackFinished),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(failed || fallbackStarted ? { fallbackReason } : {}),
    ...(finalText ? { finalText } : {}),
    ...(streamStarted ? { startedAt: eventTimestamp(streamStarted) } : {}),
    ...(streamFinished ?? fallbackFinished ?? (cancelledAfterStart ? cancelled : undefined)
      ? { finishedAt: eventTimestamp((streamFinished ?? fallbackFinished ?? cancelled) as RuntimeEvent) }
      : {})
  };
}
