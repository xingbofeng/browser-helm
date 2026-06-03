import { describe, expect, it, vi } from 'vitest';
import { ModelGateway } from '../../../../src/agent/loop/model-gateway';
import type { ModelClient } from '../../../../src/agent/model/model-client';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';

describe('ModelGateway', () => {
  it('falls back to complete when streaming fails and redacts the failure reason', async () => {
    const trace: RuntimeEvent[] = [];
    const record: RunRecord = {
      task: '检查页面',
      mode: 'ask',
      trace
    };
    const updateStreaming = vi.fn();
    const gateway = new ModelGateway({
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      updateStreaming
    });
    const complete = vi.fn(async () => ({ text: '{"type":"finish","message":"fallback"}' }));
    const streamComplete = vi.fn(async () => {
        throw new Error('stream broke sk-secret-key');
    });
    const client: ModelClient = {
      complete,
      streamComplete
    };

    const output = await gateway.requestDecision({
      client,
      settings: {
        baseUrl: 'https://api.example.com/v1',
        model: 'demo-model',
        streamingEnabled: true
      },
      runId: 'run_1',
      record,
      stepIndex: 0,
      messages: []
    });

    expect(output?.text).toBe('{"type":"finish","message":"fallback"}');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(updateStreaming).toHaveBeenCalled();
    expect(trace.map((event) => event.type)).toEqual([
      TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
    ]);
    expect(JSON.stringify(trace)).toContain('[MASKED]');
    expect(JSON.stringify(trace)).not.toContain('sk-secret-key');
  });
});
