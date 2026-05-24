import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CockpitShell } from '../../../../src/ui/components/cockpit-shell';

describe('CockpitShell', () => {
  it('renders narrow side panel landmarks without nested cards', () => {
    const html = renderToString(
      <CockpitShell
        header={<div>BrowserHelm Cockpit</div>}
        task={<div>任务输入</div>}
        tabs={<div>页面观察</div>}
        timeline={<div>Timeline</div>}
        inspector={<div>Inspector</div>}
      />
    );

    expect(html).toContain('BrowserHelm Cockpit');
    expect(html).toContain('任务输入');
    expect(html).toContain('页面观察');
    expect(html).toContain('Timeline');
    expect(html).toContain('Inspector');
    expect(html).toContain('bh-cockpitShell');
    expect(html).not.toContain('card card');
  });
});
