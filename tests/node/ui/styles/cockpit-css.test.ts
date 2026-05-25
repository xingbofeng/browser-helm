import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Cockpit CSS', () => {
  it('defines concrete styles for v0.4 cockpit layout and narrow side panel states', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/entrypoints/sidepanel/app.css'),
      'utf8'
    );

    expect(css).toContain('.bh-cockpitShell');
    expect(css).toContain('.bh-cockpitTabs');
    expect(css).toContain('.bh-cockpitInspector');
    expect(css).toContain('.bh-diagnosisOverview');
    expect(css).toContain('.bh-approvalDrawer');
    expect(css).toContain('@media');
    expect(css).toContain('max-width');
  });
});
