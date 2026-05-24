import { describe, expect, it } from 'vitest';

import { DecisionParser } from '../../../../src/agent/parser/DecisionParser';

describe('DecisionParser', () => {
  const parser = new DecisionParser();

  it('parses valid model output into AgentDecision', () => {
    const result = parser.parse(
      JSON.stringify({
        type: 'tool_call',
        tool: 'bh_mock_page_observe',
        args: {
          page: 'current'
        }
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision.type).toBe('tool_call');
  });

  it('parses fenced json model output into AgentDecision', () => {
    const result = parser.parse(`\`\`\`json
{
  "type": "finish",
  "message": "done"
}
\`\`\``);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision.type).toBe('finish');
  });

  it('rejects json object surrounded by model text', () => {
    const result = parser.parse(
      'Here is the decision: {"type":"finish","message":"done"}'
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected parse failure');
    }
    expect(result.error.code).toBe('MODEL_OUTPUT_INVALID_JSON');
  });

  it('returns parse error for invalid json', () => {
    const result = parser.parse('not-json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected parse failure');
    }
    expect(result.error.code).toBe('MODEL_OUTPUT_INVALID_JSON');
  });

  it('rejects legacy tool decision shape', () => {
    const result = parser.parse(
      JSON.stringify({
        type: 'tool',
        name: 'bh_mock_page_observe',
        args: {}
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected parse failure');
    }
    expect(result.error.code).toBe('MODEL_OUTPUT_SCHEMA_INVALID');
  });
});
