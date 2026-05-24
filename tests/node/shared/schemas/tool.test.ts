import { describe, expect, it } from 'vitest';

import { toolModeSchema, toolSpecMetaSchema } from '../../../../src/shared/schemas/tool.schema';

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
});
