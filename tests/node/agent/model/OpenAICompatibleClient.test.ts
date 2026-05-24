import { describe, expect, it } from 'vitest';

import { OpenAICompatibleClient } from '../../../../src/agent/model/OpenAICompatibleClient';

describe('OpenAICompatibleClient', () => {
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
});
