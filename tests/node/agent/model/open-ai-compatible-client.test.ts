import { describe, expect, it } from 'vitest';

import { OpenAICompatibleClient } from '../../../../src/agent/model/open-ai-compatible-client';

describe('open-ai-compatible-client', () => {
  it('throws PROVIDER_NOT_CONFIGURED without key/model/baseUrl', async () => {
    const client = new OpenAICompatibleClient({
      apiKey: '',
      baseUrl: '',
      model: ''
    });

    await expect(
      client.complete({
        runId: 'run_1',
        stepIndex: 0,
        messages: []
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED'
    });
  });

  it('uses injected fetch implementation for requests', async () => {
    let requestBody: unknown;
    const client = new OpenAICompatibleClient({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async (_input, init) => {
        if (typeof init?.body !== 'string') {
          throw new Error('expected string request body');
        }
        requestBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    type: 'finish',
                    message: 'ok'
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
    });

    const result = await client.complete({
      runId: 'run_1',
      stepIndex: 0,
      messages: [
        {
          role: 'user',
          content: 'hello'
        }
      ]
    });

    expect(result.text).toContain('"type":"finish"');
    expect(requestBody).toMatchObject({
      response_format: {
        type: 'json_object'
      }
    });
  });

  it('streams text chunks from OpenAI-compatible SSE responses', async () => {
    const requestedBodies: unknown[] = [];
    const client = new OpenAICompatibleClient({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async (_input, init) => {
        requestedBodies.push(parseJsonBody(init?.body));
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'text/event-stream'
            }
          }
        );
      }
    });
    const deltas: string[] = [];

    const result = await client.streamComplete({
      runId: 'run_1',
      stepIndex: 0,
      messages: [{ role: 'user', content: 'hello' }]
    }, {
      onDelta: (delta) => deltas.push(delta)
    });

    expect(result.text).toBe('Hello');
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(requestedBodies[0]).toMatchObject({
      stream: true
    });
  });

  it('buffers partial SSE JSON lines across network chunks', async () => {
    const client = new OpenAICompatibleClient({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"'));
              controller.enqueue(encoder.encode('}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'text/event-stream'
            }
          }
        )
    });

    const result = await client.streamComplete({
      runId: 'run_1',
      stepIndex: 0,
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(result.text).toBe('Hello');
  });

  it('mentions JSON in provider test prompts for providers that require it', async () => {
    let requestBody: unknown;
    const client = new OpenAICompatibleClient({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async (_input, init) => {
        requestBody = parseJsonBody(init?.body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }]
          }),
          { status: 200 }
        );
      }
    });

    await client.testConnection();

    expect(JSON.stringify(requestBody).toLowerCase()).toContain('json');
  });

  it('reports sanitized streaming errors', async () => {
    const client = new OpenAICompatibleClient({
      apiKey: 'sk-live-super-secret-token',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async () =>
        new Response('data: {"error":{"message":"bad sk-live-super-secret-token"}}\n\n', {
          status: 200,
          headers: {
            'content-type': 'text/event-stream'
          }
        })
    });

    await expect(
      client.streamComplete({
        runId: 'run_1',
        stepIndex: 0,
        messages: []
      })
    ).rejects.toMatchObject({
      code: 'MODEL_REQUEST_FAILED'
    });
    await expect(
      client.streamComplete({
        runId: 'run_2',
        stepIndex: 0,
        messages: []
      })
    ).rejects.not.toThrow('sk-live-super-secret-token');
  });

  it('tests provider connectivity without returning secrets', async () => {
    const client = new OpenAICompatibleClient({
      apiKey: 'sk-live-super-secret-token',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5-mini',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }]
          }),
          { status: 200 }
        )
    });

    const result = await client.testConnection();

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      supportsStreaming: true,
      model: 'gpt-5-mini'
    });
    expect(JSON.stringify(result)).not.toContain('sk-live-super-secret-token');
  });
});

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') {
    throw new Error('Expected JSON string request body');
  }
  return JSON.parse(body) as unknown;
}
