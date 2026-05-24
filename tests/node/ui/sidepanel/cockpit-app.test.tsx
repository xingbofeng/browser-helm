import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CockpitApp } from '../../../../src/ui/sidepanel/cockpit-app';
import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';

describe('CockpitApp', () => {
  it('renders cockpit shell with core tabs, timeline, approval and settings surfaces', () => {
    const html = renderToString(
      <CockpitApp
        runtime={new FakeRuntimePort({
          snapshots: [
            {
              runId: 'seed',
              mode: 'act',
              status: 'waiting_for_approval',
              refs: [],
              pendingApproval: {
                id: 'apr_1',
                runId: 'seed',
                stepId: 'step_1',
                tool: 'bh_iframe_click',
                argsPreview: { refId: 'frame_1:ref_1' },
                risk: 'high',
                reason: 'Delete account',
                status: 'pending',
                createdAt: 1
              },
              trace: [{ runId: 'seed', type: 'approval_required' }]
            }
          ]
        })}
      />
    );

    expect(html).toContain('BrowserHelm');
    expect(html).toContain('v0.4');
    expect(html).toContain('v0.4 页面数据驾驶舱');
    expect(html).toContain('页面观察');
    expect(html).toContain('Ref 映射');
    expect(html).toContain('交互元素');
    expect(html).toContain('表单字段');
    expect(html).toContain('执行时间线');
    expect(html).toContain('工具结果');
    expect(html).toContain('Settings');
  });
});
