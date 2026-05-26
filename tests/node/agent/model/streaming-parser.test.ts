import { describe, expect, it } from 'vitest';

import { parseOpenAICompatibleStreamChunk } from '../../../../src/agent/model/streaming-parser';

describe('parseOpenAICompatibleStreamChunk', () => {
  it('extracts text deltas from OpenAI-compatible SSE chunks', () => {
    const chunk = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      ''
    ].join('\n');

    expect(parseOpenAICompatibleStreamChunk(chunk)).toEqual({
      deltas: ['Hel', 'lo'],
      done: false
    });
  });

  it('marks done chunks', () => {
    expect(parseOpenAICompatibleStreamChunk('data: [DONE]\n\n')).toEqual({
      deltas: [],
      done: true
    });
  });

  it('ignores empty deltas', () => {
    const parsed = parseOpenAICompatibleStreamChunk(
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
    );

    expect(parsed).toEqual({
      deltas: [],
      done: false
    });
  });

  it('returns parse errors for invalid JSON lines', () => {
    const parsed = parseOpenAICompatibleStreamChunk('data: {"choices":\n\n');

    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors?.[0]).toContain('Invalid stream JSON');
  });

  it('extracts error events without leaking raw secrets', () => {
    const parsed = parseOpenAICompatibleStreamChunk(
      'data: {"error":{"message":"bad key sk-live-secret-token"}}\n\n'
    );

    expect(parsed.errors?.[0]).toContain('[MASKED]');
    expect(parsed.errors?.[0]).not.toContain('sk-live-secret-token');
  });
});
