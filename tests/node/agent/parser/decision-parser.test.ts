import { describe, expect, it } from 'vitest';

import { DecisionParser } from '../../../../src/agent/parser/decision-parser';

describe('decision-parser', () => {
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

  it('normalizes wrapped tool_call decisions from provider JSON mode', () => {
    const result = parser.parse(JSON.stringify({
      tool_call: {
        tool: 'bh_page_read_article',
        args: { maxChars: 1000 },
        reason: 'need article text'
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision).toMatchObject({
      type: 'tool_call',
      tool: 'bh_page_read_article',
      args: { maxChars: 1000 }
    });
  });

  it('normalizes legacy bh_form_fill formFields into bh_form_fill_many fields', () => {
    const result = parser.parse(JSON.stringify({
      tool_call: {
        tool: 'bh_form_fill',
        args: {
          formFields: {
            ref_108: '美国'
          }
        },
        reason: 'fill search box'
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision).toMatchObject({
      type: 'tool_call',
      tool: 'bh_form_fill_many',
      args: {
        fields: [{ fieldRefId: 'ref_108', value: '美国' }]
      }
    });
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
