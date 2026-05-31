import { describe, expect, it } from 'vitest';

import {
  runModeLabels,
  runModeSchema,
  toolModeSchema,
  toolSpecMetaSchema
} from '../../../../src/shared/schemas/tool.schema';

describe('toolSpecMetaSchema', () => {
  it('accepts full tool spec metadata shape', () => {
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

  it('accepts user-selectable run modes including full', () => {
    expect(runModeSchema.parse('ask')).toBe('ask');
    expect(runModeSchema.parse('debug')).toBe('debug');
    expect(runModeSchema.parse('form')).toBe('form');
    expect(runModeSchema.parse('act')).toBe('act');
    expect(runModeSchema.parse('full')).toBe('full');
    expect(() => runModeSchema.parse('admin')).toThrowError();
  });

  it('provides run mode label keys', () => {
    expect(runModeLabels).toEqual({
      ask: 'ask',
      debug: 'debug',
      form: 'form',
      act: 'act',
      full: 'full'
    });
  });
});
