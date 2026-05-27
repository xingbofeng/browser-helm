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
      reasoningDeltas: [],
      done: false
    });
  });

  it('marks done chunks', () => {
    expect(parseOpenAICompatibleStreamChunk('data: [DONE]\n\n')).toEqual({
      deltas: [],
      reasoningDeltas: [],
      done: true
    });
  });

  it('ignores empty deltas', () => {
    const parsed = parseOpenAICompatibleStreamChunk(
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
    );

    expect(parsed).toEqual({
      deltas: [],
      reasoningDeltas: [],
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

  it('extracts reasoning deltas when model provides reasoning_content (DeepSeek R1 / Qwen)', () => {
    const chunk = [
      'data: {"choices":[{"delta":{"reasoning_content":"User wants to summarize","content":""}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":" a long page, should","content":""}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"","content":"好的"}}]}',
      'data: {"choices":[{"delta":{"content":"，我来帮您总结。"}}]}',
      ''
    ].join('\n');

    expect(parseOpenAICompatibleStreamChunk(chunk)).toEqual({
      deltas: ['好的', '，我来帮您总结。'],
      reasoningDeltas: ['User wants to summarize', ' a long page, should'],
      done: false
    });
  });

  it('returns empty reasoningDeltas when no reasoning_content in stream', () => {
    expect(parseOpenAICompatibleStreamChunk(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
    )).toEqual({
      deltas: ['hello'],
      reasoningDeltas: [],
      done: false
    });
  });

  it('mixed content and reasoning in single chunk produces both arrays', () => {
    const parsed = parseOpenAICompatibleStreamChunk(
      'data: {"choices":[{"delta":{"reasoning_content":"thinking...","content":"answer"}}]}\n\n'
    );

    expect(parsed.reasoningDeltas).toEqual(['thinking...']);
    expect(parsed.deltas).toEqual(['answer']);
  });
});
