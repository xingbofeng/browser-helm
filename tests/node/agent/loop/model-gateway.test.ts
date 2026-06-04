import { describe, expect, it, vi } from 'vitest';
import { ModelGateway } from '../../../../src/agent/loop/model-gateway';
import type { ModelClient } from '../../../../src/agent/model/model-client';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';

describe('ModelGateway', () => {
  it('records reasoning deltas so DeepSeek-style streams show visible progress', async () => {
    const trace: RuntimeEvent[] = [];
    const record: RunRecord = {
      task: '解释选中文字',
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
    const client: ModelClient = {
      complete: vi.fn(),
      async streamComplete(_input, callbacks) {
        callbacks?.onReasoningDelta?.('先理解选中文字，');
        callbacks?.onReasoningDelta?.('再组织中文解释。');
        callbacks?.onDelta?.('{"type":"finish","message":"这段话的意思是');
        return { text: '{"type":"finish","message":"这段话的意思是浏览器能力增强。"}' };
      }
    };

    await gateway.requestDecision({
      client,
      settings: {
        baseUrl: 'https://api.example.com/v1',
        model: 'deepseek-v4-pro',
        streamingEnabled: true
      },
      runId: 'run_1',
      record,
      stepIndex: 0,
      messages: []
    });

    const deltaPayloads = trace
      .filter((event) => event.type === TRACE_EVENT_NAMES.MODEL_STREAM_DELTA)
      .map((event) => event.payload as Record<string, unknown>);
    expect(deltaPayloads).toEqual([
      expect.objectContaining({
        reasoningCharCount: 8,
        reasoningPreview: '先理解选中文字，'
      }),
      expect.objectContaining({
        reasoningCharCount: 16,
        reasoningPreview: '先理解选中文字，再组织中文解释。'
      }),
      expect.objectContaining({
        charCount: 35,
        previewText: '{"type":"finish","message":"这段话的意思是'
      })
    ]);
    expect(updateStreaming).toHaveBeenCalledTimes(4);
  });

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

  it('returns a failed decision when streaming and fallback completion both fail', async () => {
    const trace: RuntimeEvent[] = [];
    const record: RunRecord = {
      task: '检查页面',
      mode: 'ask',
      trace
    };
    const gateway = new ModelGateway({
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      updateStreaming: vi.fn()
    });
    const client: ModelClient = {
      complete: vi.fn(async () => {
        throw new Error('Model request failed with status 402: endpoint is inactive: FREE_QUOTA_EXHAUSTED sk-secret-key');
      }),
      streamComplete: vi.fn(async () => {
        throw new Error('Model stream request failed with status 402: endpoint is inactive: FREE_QUOTA_EXHAUSTED sk-secret-key');
      })
    };

    const output = await gateway.requestDecision({
      client,
      settings: {
        baseUrl: 'https://tokenhub.tencentmaas.com/v1',
        model: 'deepseek-v4-flash',
        streamingEnabled: true
      },
      runId: 'run_1',
      record,
      stepIndex: 0,
      messages: []
    });

    expect(JSON.parse(output?.text ?? '{}')).toMatchObject({
      type: 'fail',
      code: 'MODEL_REQUEST_FAILED'
    });
    expect(output?.text).toContain('FREE_QUOTA_EXHAUSTED');
    expect(output?.text).not.toContain('sk-secret-key');
    expect(trace.map((event) => event.type)).toEqual([
      TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
      TRACE_EVENT_NAMES.MODEL_STREAM_FAILED
    ]);
    expect(JSON.stringify(trace)).toContain('FREE_QUOTA_EXHAUSTED');
    expect(JSON.stringify(trace)).not.toContain('sk-secret-key');
  });
});
