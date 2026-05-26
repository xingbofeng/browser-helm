import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CockpitApp } from '../../../../src/ui/sidepanel/cockpit-app';
import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';

describe('CockpitApp', () => {
  it('renders BrowserHelm agent surface with debug and model configuration entry points', () => {
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
        initialRunId="seed"
      />
    );

    expect(html).toContain('BrowserHelm');
    expect(html).not.toContain('Cockpit');
    expect(html).not.toContain('页面数据驾驶舱');
    expect(html).not.toContain('页面观察');
    expect(html).toContain('BrowserHelm Agent 消息');
    expect(html).toContain('高级开发者选项');
    expect(html).toContain('aria-label="打开模型配置"');
    expect(html).toContain('你想和 BrowserHelm 聊点什么......');
  });
});
