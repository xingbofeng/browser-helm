// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';
import { CockpitApp } from '../../../../src/ui/sidepanel/cockpit-app';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CockpitApp interaction', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('starts a run, renders structured tabs and cancels through RuntimePort', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed',
          mode: 'form',
          status: 'observed',
          refs: [],
          structuredPageData: structuredData()
        }
      ]
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} />);
      await Promise.resolve();
    });
    await act(async () => {
      button('启动任务').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('Ref 映射').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('https://example.com/register');
    expect(container.textContent).toContain('ref_submit');

    await act(async () => {
      button('停止任务').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已取消');
    root.unmount();
    container.remove();
  });

  it('auto-observes a provided target tab id for extension side panel URLs', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed',
          mode: 'ask',
          status: 'observed',
          refs: [],
          structuredPageData: structuredData()
        }
      ]
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} targetTabId={99} />);
    });

    expect(container.textContent).toContain('https://example.com/register');
    root.unmount();
    container.remove();
  });

  it('renders pending approval and sends deny decisions', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
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
            argsPreview: {
              password: 'secret',
              refId: 'frame_1:ref_1'
            },
            risk: 'high',
            reason: 'Delete account',
            actionPreview: 'Click Delete',
            status: 'pending',
            createdAt: 1
          },
          trace: [{ runId: 'seed', type: 'approval_required' }]
        }
      ]
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} />);
      await Promise.resolve();
    });
    await act(async () => {
      button('启动任务').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Click Delete');
    expect(container.textContent).toContain('[MASKED]');
    expect(container.textContent).not.toContain('secret');

    await act(async () => {
      button('Deny').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('USER_DENIED_APPROVAL');
    root.unmount();
    container.remove();
  });
});

function button(name: string): HTMLButtonElement {
  const element = [...document.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.includes(name) ||
      candidate.getAttribute('aria-label') === name
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${name}`);
  }
  return element;
}

function structuredData() {
  return {
    observation: {
      status: 'ready' as const,
      summary: '当前页面为“注册页”',
      count: 1,
      items: [
        {
          url: 'https://example.com/register',
          title: '注册页',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '邮箱 密码',
          pageStateSummary: '页面包含表单'
        }
      ],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    },
    refs: {
      status: 'ready' as const,
      summary: '检测到 1 个 ref',
      count: 1,
      items: [
        {
          refId: 'ref_submit',
          role: 'button',
          name: '提交',
          tagName: 'button',
          visible: true,
          disabled: false
        }
      ],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    },
    interactive: {
      status: 'empty' as const,
      summary: '无交互元素',
      count: 0,
      items: [],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    },
    forms: {
      status: 'empty' as const,
      summary: '无表单字段',
      count: 0,
      items: [],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    }
  };
}
