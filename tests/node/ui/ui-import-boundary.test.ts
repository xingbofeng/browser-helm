import { describe, expect, it } from 'vitest';

import { assertLayerBoundaries } from '../../helpers/layer-boundary';

describe('Cockpit UI import boundary', () => {
  it('keeps src/ui decoupled from agent, tools, model and content internals', () => {
    expect(
      assertLayerBoundaries({
        rootDir: process.cwd(),
        forbidden: [
          {
            files: ['src/ui/**/*.ts*'],
            imports: [
              'src/agent/kernel',
              'src/tools/core',
              'src/agent/model',
              'src/page/messaging',
              'src/entrypoints/content'
            ]
          }
        ]
      })
    ).toEqual([]);
  });
});
