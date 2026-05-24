import { describe, expect, it } from 'vitest';

import { agentDecisionSchema } from '../../../../src/shared/schemas/agent-decision.schema';

describe('agentDecisionSchema', () => {
  it('accepts tool_call with structured args', () => {
    const result = agentDecisionSchema.parse({
      type: 'tool_call',
      tool: 'bh_mock_page_observe',
      args: {
        page: 'current'
      }
    });

    if (result.type !== 'tool_call') {
      throw new Error('expected tool_call decision');
    }
    expect(result.tool).toBe('bh_mock_page_observe');
  });

  it('accepts finish and fail payloads', () => {
    const finish = agentDecisionSchema.parse({
      type: 'finish',
      message: 'done'
    });
    const fail = agentDecisionSchema.parse({
      type: 'fail',
      message: 'bad output',
      code: 'MODEL_OUTPUT_INVALID'
    });

    expect(finish.type).toBe('finish');
    expect(fail.type).toBe('fail');
  });

  it('rejects legacy decision shape using type=tool', () => {
    expect(() =>
      agentDecisionSchema.parse({
        type: 'tool',
        name: 'bh_mock_page_observe',
        args: {}
      })
    ).toThrowError();
  });
});
