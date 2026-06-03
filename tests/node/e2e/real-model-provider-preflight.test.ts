import { describe, expect, it, vi } from 'vitest';

import {
  classifyRealModelProviderError,
  preflightRealModelProvider
} from '../../e2e/flows/real-model-provider-preflight';

describe('real model provider preflight', () => {
  it('classifies exhausted quota as provider unavailable instead of product failure', () => {
    expect(classifyRealModelProviderError(402, {
      error: {
        message: 'endpoint is inactive: FREE_QUOTA_EXHAUSTED',
        code: '401008',
        type: 'gateway_error',
        request_id: 'req_1'
      }
    })).toEqual({
      ok: false,
      reason: 'provider_unavailable',
      message: 'Provider preflight failed with status 402: endpoint is inactive: FREE_QUOTA_EXHAUSTED | 401008 | gateway_error'
    });
  });

  it('returns available when a minimal chat completion succeeds', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'pong' } }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const result = await preflightRealModelProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-test-secret',
      model: 'real-model'
    }, fetchImpl);
    expect(result).toEqual({
      ok: true
    });
    expect(JSON.stringify(result)).not.toContain('sk-test-secret');
  });
});
