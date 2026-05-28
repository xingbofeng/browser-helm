import { describe, expect, it } from 'vitest';
import {
  emptyStreamingState,
  streamingStateFromTrace
} from '../../../../src/background/runtime/run/streaming-state';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('emptyStreamingState', () => {
  it('returns default streaming state', () => {
    const state = emptyStreamingState();
    expect(state).toEqual({
      enabled: true,
      active: false,
      chunkCount: 0,
      fallbackUsed: false
    });
  });
});

describe('streamingStateFromTrace', () => {
  it('returns default state for empty trace', () => {
    const state = streamingStateFromTrace([]);
    expect(state.active).toBe(false);
    expect(state.chunkCount).toBe(0);
    expect(state.fallbackUsed).toBe(false);
  });

  it('returns active when stream started but not finished', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { provider: 'openai', model: 'gpt-4', streamingEnabled: true }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.active).toBe(true);
    expect(state.provider).toBe('openai');
    expect(state.model).toBe('gpt-4');
    expect(state.startedAt).toBe(1000);
  });

  it('counts delta events', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
        timestamp: 1001,
        payload: { chunkCount: 1, charCount: 10 }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
        timestamp: 1002,
        payload: { chunkCount: 2, charCount: 20 }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.active).toBe(true);
    expect(state.chunkCount).toBe(2);
  });

  it('returns inactive with finalText when stream finished', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED,
        timestamp: 2000,
        payload: { chunkCount: 5, charCount: 100, model: 'gpt-4', finalPreview: 'Hello world' }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.active).toBe(false);
    expect(state.chunkCount).toBe(5);
    expect(state.finalText).toBe('Hello world');
    expect(state.finishedAt).toBe(2000);
  });

  it('extracts token and cost estimate metadata from finished provider events', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED,
        timestamp: 2000,
        payload: {
          chunkCount: 2,
          charCount: 40,
          usage: {
            inputTokensEstimate: 25,
            outputTokensEstimate: 10,
            totalTokensEstimate: 35,
            costUsdEstimate: null,
            costEstimateStatus: 'unpriced'
          }
        }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.usage).toEqual({
      inputTokensEstimate: 25,
      outputTokensEstimate: 10,
      totalTokensEstimate: 35,
      costUsdEstimate: null,
      costEstimateStatus: 'unpriced'
    });
  });

  it('returns fallbackReason when stream failed', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
        timestamp: 1500,
        payload: { message: 'Connection timeout', chunkCount: 3 }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.active).toBe(false);
    expect(state.fallbackReason).toBe('Connection timeout');
  });

  it('tracks fallback started and finished', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
        timestamp: 1500,
        payload: { reason: 'stream_failed' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
        timestamp: 2000,
        payload: { charCount: 50 }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.fallbackUsed).toBe(true);
    expect(state.active).toBe(false);
    expect(state.finishedAt).toBe(2000);
  });

  it('returns inactive when cancelled after started', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: true }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_CANCELLED,
        timestamp: 1500,
        payload: { reason: 'user_cancelled' }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.active).toBe(false);
  });

  it('respects streamingEnabled false', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { streamingEnabled: false }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.enabled).toBe(false);
  });

  it('extracts provider and model from started payload', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        timestamp: 1000,
        payload: { provider: 'anthropic', model: 'claude-3', streamingEnabled: true }
      }
    ];
    const state = streamingStateFromTrace(trace);
    expect(state.provider).toBe('anthropic');
    expect(state.model).toBe('claude-3');
  });
});
