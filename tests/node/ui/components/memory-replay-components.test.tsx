// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { MemoryViewer } from '../../../../src/ui/components/memory-viewer';
import { ReplayPreview } from '../../../../src/ui/components/replay-preview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('memory and replay components', () => {
  it('renders memory entries and supports deletion', () => {
    const onDelete = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <MemoryViewer
            domain="app.example.com"
            entries={[{
              id: 'mem_1',
              domain: 'app.example.com',
              kind: 'domain_fact',
              task: '打开账单',
              summary: '入口在 Billing',
              successCount: 2,
              failureCount: 0,
              createdAt: 1,
              updatedAt: 1,
              tags: [],
              masked: true
            }]}
            onDelete={onDelete}
            onClearDomain={() => undefined}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('打开账单');
    expect(container.textContent).toContain('入口在 Billing');
    const buttons = container.querySelectorAll('button');
    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledWith('mem_1');
    root.unmount();
    container.remove();
  });

  it('renders replay preview steps and approval controls', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <ReplayPreview
            preview={{
              workflowId: 'flow_1',
              domain: 'app.example.com',
              intent: '提交表单',
              stepCount: 1,
              highRisk: true,
              requiresApproval: true,
              steps: [{
                id: 'step_1',
                tool: 'bh_form_submit_with_approval',
                summary: '提交最终表单',
                risk: 'high',
                requiresApproval: true
              }],
              warnings: ['需要确认']
            }}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('Replay 预览');
    expect(container.textContent).toContain('提交最终表单');
    act(() => {
      container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDeny).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});

