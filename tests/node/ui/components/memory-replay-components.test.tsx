// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { MemoryViewer } from '../../../../src/ui/components/memory-viewer';
import { ReplayPreview } from '../../../../src/ui/components/replay-preview';
import { WorkflowDraftPreview } from '../../../../src/ui/components/workflow-draft-preview';

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
            onClearAll={() => undefined}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('打开账单');
    expect(container.textContent).toContain('入口在 Billing');
    const buttons = container.querySelectorAll('button');
    act(() => {
      buttons[buttons.length - 1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledWith('mem_1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders domain and global memory clearing controls', () => {
    const onClearDomain = vi.fn();
    const onClearAll = vi.fn();
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
            onDelete={() => undefined}
            onClearDomain={onClearDomain}
            onClearAll={onClearAll}
          />
        </I18nProvider>
      );
    });

    const buttons = container.querySelectorAll('button');
    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClearDomain).toHaveBeenCalledOnce();
    expect(onClearAll).toHaveBeenCalledOnce();
    act(() => {
      root.unmount();
    });
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
              warnings: ['需要确认'],
              unmetPreconditions: [],
              preconditionResults: []
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
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders an unsaved workflow draft and exposes save-for-preview action', () => {
    const onSave = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <WorkflowDraftPreview
            draft={{
              id: 'draft_run_1',
              domain: 'app.example.com',
              intent: '打开账单报表',
              taskDescription: '打开账单报表',
              steps: [{
                id: 'draft_step_1',
                tool: 'bh_page_observe',
                summary: '观察账单页面',
                risk: 'safe',
                requiresApproval: false
              }],
              completionEvidence: ['账单页面已打开'],
              requiresPreview: true,
              requiresApproval: true,
              saved: false
            }}
            onSave={onSave}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('Workflow 草稿');
    expect(container.textContent).toContain('未保存');
    expect(container.textContent).toContain('观察账单页面');
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSave).toHaveBeenCalledOnce();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
