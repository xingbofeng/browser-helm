import { describe, expect, it } from 'vitest';
import { DynamicContextBuilder } from '../../../../src/agent/loop/prompt/dynamic-context-builder';
import type { ModelMessage } from '../../../../src/shared/schemas/model-message.schema';

describe('DynamicContextBuilder', () => {
  it('builds the dynamic user message with decision guidance and compacted JSON context', () => {
    const systemMessage: ModelMessage = {
      role: 'system',
      content: 'stable prefix'
    };
    const historyMessage: ModelMessage = {
      role: 'user',
      content: 'Conversation history before current request:\n[1] User: previous'
    };

    const message = new DynamicContextBuilder().buildUserMessage({
      baseMessages: [systemMessage, historyMessage],
      decisionGuidance: 'finish now',
      userContent: {
        task: '总结页面',
        observation: { title: 'Demo' }
      }
    });

    expect(message.role).toBe('user');
    expect(message.content).toContain('RUNTIME_DECISION_GUIDANCE: finish now');
    expect(message.content).toContain('"task":"总结页面"');
    expect(message.content).toContain('"observation"');
  });
});
