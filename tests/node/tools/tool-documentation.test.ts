import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const toolFiles = [
  'src/tools/a11y/bh-a11y-find-interactive.ts',
  'src/tools/a11y/bh-a11y-refresh-refs.ts',
  'src/tools/a11y/bh-a11y-resolve-ref.ts',
  'src/tools/a11y/bh-a11y-snapshot.ts',
  'src/tools/action/bh-action-check-readiness.ts',
  'src/tools/agent/bh-agent-ask-user.ts',
  'src/tools/agent/bh-agent-fail.ts',
  'src/tools/agent/bh-agent-finish.ts',
  'src/tools/element/bh-element-inspect.ts',
  'src/tools/element/bh-element-read-state.ts',
  'src/tools/form/bh-form-find-disabled-submit-reason.ts',
  'src/tools/form/bh-form-find-missing-required.ts',
  'src/tools/form/bh-form-find-validation-errors.ts',
  'src/tools/form/bh-form-inspect.ts',
  'src/tools/form/bh-form-list.ts',
  'src/tools/form/bh-form-read-fields.ts',
  'src/tools/frame/bh-frame-list.ts',
  'src/tools/frame/bh-iframe-click.ts',
  'src/tools/frame/bh-iframe-read.ts',
  'src/tools/frame/bh-iframe-type.ts',
  'src/tools/page/bh-page-observe.ts'
] as const;

describe('tool documentation standard', () => {
  it.each(toolFiles)('%s has a TSDoc block before the exported tool', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toMatch(
      /\/\*\*[\s\S]*?\*\/\nexport (function|const) [A-Za-z0-9]+/
    );
  });

  it.each(toolFiles)('%s keeps a Chinese maintenance comment before title', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toMatch(/\/\/ [^\n]*[\u4E00-\u9FFF][^\n]*\n\s*title:/);
  });

  it('documents every tool in src/tools/README.md', () => {
    const readme = readFileSync(resolve(process.cwd(), 'src/tools/README.md'), 'utf8');

    for (const file of toolFiles) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const name = source.match(/name: '(bh_[^']+)'/)?.[1];

      expect(name).toBeDefined();
      expect(readme).toContain(`| \`${name}`);
    }
    expect(readme).not.toContain('src/tools/page/bh-frame-list.ts');
  });
});
