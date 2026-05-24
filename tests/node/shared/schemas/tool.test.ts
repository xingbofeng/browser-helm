import { describe, expect, it } from 'vitest';

import {
  runModeLabels,
  runModeSchema,
  toolModeSchema,
  toolSpecMetaSchema
} from '../../../../src/shared/schemas/tool.schema';

describe('toolSpecMetaSchema', () => {
  it('accepts full v0.1 tool spec metadata shape', () => {
    const result = toolSpecMetaSchema.parse({
      name: 'bh_mock_page_observe',
      title: 'Observe Page',
      description: 'Collects page summary and interactive refs',
      modes: ['internal', 'ask'],
      risk: 'safe'
    });

    expect(result.modes).toContain('internal');
  });

  it('rejects unknown mode', () => {
    expect(() =>
      toolModeSchema.parse('admin')
    ).toThrowError();
  });

  it('accepts user-selectable run modes including act', () => {
    expect(runModeSchema.parse('ask')).toBe('ask');
    expect(runModeSchema.parse('debug')).toBe('debug');
    expect(runModeSchema.parse('form')).toBe('form');
    expect(runModeSchema.parse('act')).toBe('act');
    expect(() => runModeSchema.parse('admin')).toThrowError();
  });

  it('provides bilingual run mode labels', () => {
    expect(runModeLabels).toEqual({
      ask: '询问 / Ask',
      debug: '调试 / Debug',
      form: '表单 / Form',
      act: '动作准备 / Act'
    });
  });
});
