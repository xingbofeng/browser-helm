import { describe, expect, it } from 'vitest';

import { VisionClient } from '../../../../src/agent/model/vision-client';
import { OpenAICompatibleClient } from '../../../../src/agent/model/open-ai-compatible-client';
import type { ModelClient } from '../../../../src/agent/model/model-client';

describe('VisionClient', () => {
  it('returns explicit fallback when the model client does not support vision', async () => {
    const textOnlyClient: ModelClient = {
      async complete() {
        return { text: '{"type":"finish","message":"text only"}' };
      }
    };
    const client = new VisionClient(textOnlyClient);

    const result = await client.describeViewport({
      imageDataUrl: 'data:image/png;base64,abc',
      prompt: 'Describe layout'
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'vision_not_supported',
      observation: {
        summary: 'Vision model is unavailable; use DOM/a11y observation instead.',
        fallback: 'dom_a11y'
      }
    });
  });

  it('normalizes model JSON into a bounded vision observation', async () => {
    const client = new VisionClient({
      async completeVision() {
        return {
          text: JSON.stringify({
            summary: '按钮被弹窗遮挡',
            visibleText: ['Checkout', 'Pay now'],
            blockers: ['cookie banner overlaps primary button'],
            layoutIssues: ['primary button is visually covered'],
            confidence: 0.91
          })
        };
      },
      async complete() {
        return { text: '{}' };
      }
    });

    const result = await client.describeViewport({
      imageDataUrl: 'data:image/png;base64,abc',
      prompt: 'Detect overlay'
    });

    expect(result).toMatchObject({
      ok: true,
      observation: {
        summary: '按钮被弹窗遮挡',
        visibleText: ['Checkout', 'Pay now'],
        blockers: ['cookie banner overlaps primary button'],
        layoutIssues: ['primary button is visually covered'],
        confidence: 0.91
      }
    });
  });
});

describe('OpenAICompatibleClient vision support', () => {
  it('sends image_url content for vision completion requests', async () => {
    let requestBody: unknown;
    const client = new OpenAICompatibleClient({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-vision',
      fetchImpl: async (_input, init) => {
        if (typeof init?.body !== 'string') {
          throw new Error('expected string request body');
        }
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"summary":"ok"}' } }]
        }), { status: 200 });
      }
    });

    const result = await client.completeVision({
      runId: 'run_1',
      stepIndex: 0,
      prompt: 'Describe viewport',
      imageDataUrl: 'data:image/png;base64,abc'
    });

    expect(result.text).toBe('{"summary":"ok"}');
    expect(requestBody).toMatchObject({
      model: 'gpt-vision',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe viewport' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
        ]
      }]
    });
  });
});
