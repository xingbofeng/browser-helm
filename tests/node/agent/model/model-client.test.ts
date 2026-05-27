import { describe, expect, it } from 'vitest';

import type { ModelClient } from '../../../../src/agent/model/model-client';

describe('ModelClient contract', () => {
  it('supports complete(input) -> { text } shape', async () => {
    const client: ModelClient = {
      async complete() {
        return {
          text: 'ok'
        };
      }
    };

    const result = await client.complete({
      runId: 'run_1',
      stepIndex: 0,
      messages: []
    });

    expect(result.text).toBe('ok');
  });

  it('streamComplete onDelta 调用时支持可选的 onReasoningDelta 回调', async () => {
    let capturedReasoning = '';

    const client: ModelClient = {
      async complete() {
        return { text: 'ok' };
      },
      async streamComplete(_input, callbacks) {
        callbacks?.onReasoningDelta?.('thinking...');
        callbacks?.onReasoningDelta?.(' more thinking');
        callbacks?.onDelta?.('ans');
        callbacks?.onDelta?.('wer');
        return { text: 'answer' };
      }
    };

    let text = '';
    await client.streamComplete?.(
      { runId: 'r', stepIndex: 0, messages: [] },
      {
        onReasoningDelta: (delta) => { capturedReasoning += delta; },
        onDelta: (delta) => { text += delta; }
      }
    );

    expect(capturedReasoning).toBe('thinking... more thinking');
    expect(text).toBe('answer');
  });

  it('streamComplete 回调包含 onReasoningDelta，但可选（不传不报错）', async () => {
    const client: ModelClient = {
      async complete() {
        return { text: 'ok' };
      },
      async streamComplete(_input, callbacks) {
        callbacks?.onReasoningDelta?.('step 1');
        callbacks?.onDelta?.('result');
        return { text: 'result' };
      }
    };

    let capturedText = '';
    // 不传 onReasoningDelta — 不应报错
    const output = await client.streamComplete?.(
      { runId: 'r', stepIndex: 0, messages: [] },
      {
        onDelta: (delta) => { capturedText += delta; }
      }
    );

    expect(output?.text).toBe('result');
    expect(capturedText).toBe('result');
  });
});
