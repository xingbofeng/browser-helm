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

  it('preserves taskStateUpdate on model decisions', () => {
    const result = parser.parse(JSON.stringify({
      type: 'finish',
      message: '已完成。',
      taskStateUpdate: {
        goal: '填写姓名',
        completed: ['姓名已填写'],
        remaining: [],
        recommendedNextDecision: 'finish',
        reason: '用户没有要求提交'
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision).toEqual({
      type: 'finish',
      message: '已完成。',
      taskStateUpdate: {
        goal: '填写姓名',
        completed: ['姓名已填写'],
        remaining: [],
        recommendedNextDecision: 'finish',
        reason: '用户没有要求提交'
      }
    });
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

  it('parses a JSON decision followed by stray provider thinking tags', () => {
    const result = parser.parse(
      '{"type":"tool_call","tool":"bh_cdp_get_network_events","args":{},"reason":"读取 network"}\n</think>\n'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected parse success');
    }
    expect(result.decision).toMatchObject({
      type: 'tool_call',
      tool: 'bh_cdp_get_network_events',
      args: {}
    });
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

  it('normalizes provider ask variants into ask_user decisions', () => {
    const shorthand = parser.parse(JSON.stringify({
      type: 'ask',
      message: '请提供要填写的具体值'
    }));
    const messageField = parser.parse(JSON.stringify({
      type: 'ask_user',
      message: '请提供姓名和邮箱'
    }));

    expect(shorthand.ok).toBe(true);
    expect(messageField.ok).toBe(true);
    if (!shorthand.ok || !messageField.ok) {
      throw new Error('expected ask variants to parse');
    }
    expect(shorthand.decision).toEqual({
      type: 'ask_user',
      question: '请提供要填写的具体值'
    });
    expect(messageField.decision).toEqual({
      type: 'ask_user',
      question: '请提供姓名和邮箱'
    });
  });

  it('normalizes legacy bh_ask_user tool calls into ask_user decisions', () => {
    const result = parser.parse(JSON.stringify({
      type: 'tool_call',
      tool: 'bh_ask_user',
      args: {
        message: '请提供姓氏、名字、邮箱和密码。'
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected bh_ask_user to parse');
    }
    expect(result.decision).toEqual({
      type: 'ask_user',
      question: '请提供姓氏、名字、邮箱和密码。'
    });
  });

  it('replays run_6 provider decision envelope into a finish decision', () => {
    const result = parser.parse(JSON.stringify({
      type: 'decision',
      decision: 'finish',
      finish: {
        message: '当前页面是知乎问题的页面。这里是 400 字总结。'
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected decision envelope finish to parse');
    }
    expect(result.decision).toEqual({
      type: 'finish',
      message: '当前页面是知乎问题的页面。这里是 400 字总结。'
    });
  });

  it('replays run_6 legacy visible text tool alias', () => {
    const result = parser.parse(JSON.stringify({
      type: 'tool_call',
      tool: 'bh_page_get_visible_text',
      args: {}
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected visible text alias to parse');
    }
    expect(result.decision).toEqual({
      type: 'tool_call',
      tool: 'bh_page_read_visible_text',
      args: {}
    });
  });

  it('normalizes unsupported multi-action envelopes into ask_user decisions', () => {
    const result = parser.parse(JSON.stringify({
      type: 'multi',
      actions: [
        {
          type: 'tool_call',
          tool: 'bh_form_fill_many',
          args: {
            fields: [{ fieldRefId: 'ref_name', value: '张三' }]
          }
        }
      ],
      finish: {
        message: '已填写所有字段。',
        success: true
      }
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected multi envelope to normalize');
    }
    expect(result.decision).toEqual({
      type: 'ask_user',
      question: '我一次只能执行一个下一步动作。请确认要继续执行哪一步，或提供需要填写的具体字段值。'
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
