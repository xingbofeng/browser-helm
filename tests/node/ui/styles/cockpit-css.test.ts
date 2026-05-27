import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Cockpit CSS', () => {
  it('defines concrete styles for the agent side panel and narrow states', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/entrypoints/sidepanel/app.css'),
      'utf8'
    );

    expect(css).toContain('.bh-agentSidePanel');
    expect(css).toContain('.bh-agentWaterfall');
    expect(css).toContain('.bh-agentComposerDock');
    expect(css).toContain('.bh-debugDrawer');
    expect(css).toContain('.bh-modelConfig');
    expect(css).toContain('.bh-approvalDrawer');
    expect(css).toContain('@media');
    expect(css).toContain('max-width');
    expect(css).toContain('grid-template-columns: minmax(124px, auto) minmax(0, 1fr) auto');
    expect(css).toContain('.bh-pauseButton');
    expect(css).toContain('left: 0');
    expect(css).toContain('width: max(100%, 176px)');
    expect(css).toContain('.bh-agentSidePanel .bh-headerIconButton:hover:not(:disabled)');
    expect(css).toContain('.bh-agentHeaderActions');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('background: #fff0cf !important');
    expect(css).toContain('transform: none !important');
    expect(css).toContain('cursor: url("../../../node_modules/animal-island-ui/dist/files/cursor-icon.1ea93a65.png") 4 0, default !important');
  });

  it('keeps cockpit data tables within the side panel width', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/entrypoints/sidepanel/app.css'),
      'utf8'
    );
    const dataTableRule = css.match(/\.bh-dataTable\s*\{[^}]+\}/)?.[0] ?? '';

    expect(css).toContain('.bh-dataTable');
    expect(dataTableRule).toContain('table-layout: fixed');
    expect(dataTableRule).toContain('min-width: 0');
    expect(dataTableRule).not.toContain('min-width: 560px');
    expect(css).toContain('.bh-dataTableWrap');
    expect(css).toContain('overflow-x: hidden');
  });
});
