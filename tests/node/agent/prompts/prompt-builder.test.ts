import { describe, expect, it } from 'vitest';

import { PromptBuilder } from '../../../../src/agent/prompts/prompt-builder';

describe('prompt-builder', () => {
  it('builds a system prompt with tool contract hints', () => {
    const builder = new PromptBuilder();
    const prompt = builder.buildSystemPrompt([
      {
        name: 'bh_mock_page_observe',
        title: 'Observe Page',
        description: 'Collects page state',
        modes: ['internal'],
        risk: 'safe',
        argsSchema: {
          type: 'object',
          properties: {
            page: {
              type: 'string'
            }
          },
          required: ['page']
        }
      }
    ]);

    expect(prompt).toContain('tool_call');
    expect(prompt).toContain('bh_mock_page_observe');
    expect(prompt).toContain('Collects page state');
    expect(prompt).toContain('"page"');
    expect(prompt).toContain('risk=safe');
  });
});
