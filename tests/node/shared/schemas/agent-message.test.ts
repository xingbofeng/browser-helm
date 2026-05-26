import { describe, expect, it } from 'vitest';

import {
  agentMessageSchema,
  providerTestResultSchema,
  streamingStateSchema
} from '../../../../src/shared/schemas/agent-message.schema';

describe('agent message schemas', () => {
  it('accepts recoverable product messages', () => {
    const message = agentMessageSchema.parse({
      id: 'msg_1',
      role: 'agent',
      kind: 'diagnosis',
      status: 'streaming',
      title: '正在诊断',
      content: 'BrowserHelm 正在检查当前页面。',
      createdAt: 1,
      updatedAt: 2,
      debugEventIds: ['event_1']
    });

    expect(message.kind).toBe('diagnosis');
    expect(message.debugEventIds).toEqual(['event_1']);
  });

  it('rejects messages that expose obvious provider secrets', () => {
    expect(() =>
      agentMessageSchema.parse({
        id: 'msg_secret',
        role: 'agent',
        kind: 'error',
        status: 'complete',
        content: 'request failed with sk-live-super-secret-token',
        createdAt: 1,
        updatedAt: 1
      })
    ).toThrowError(/sensitive/i);
  });

  it('defaults streaming state to non-active and zero chunks', () => {
    const state = streamingStateSchema.parse({
      enabled: true
    });

    expect(state).toMatchObject({
      enabled: true,
      active: false,
      chunkCount: 0,
      fallbackUsed: false
    });
  });

  it('accepts provider test results without API keys', () => {
    const result = providerTestResultSchema.parse({
      ok: true,
      code: 'OK',
      message: '连接正常',
      supportsStreaming: true,
      model: 'gpt-4.1-mini'
    });

    expect(result.supportsStreaming).toBe(true);
  });

  it('rejects provider test messages that contain obvious API keys', () => {
    expect(() =>
      providerTestResultSchema.parse({
        ok: false,
        code: 'MODEL_REQUEST_FAILED',
        message: '401 for sk-test-secret'
      })
    ).toThrowError(/sensitive/i);
  });
});
