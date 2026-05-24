// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';
import type { StructuredPageData } from '../../../../src/shared/schemas/structured-page-data.schema';
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

    expect(container.textContent).toContain('https://example.com/register');
    expect(container.textContent).toContain('已完成');

    await act(async () => {
      button('Ref 映射').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('ref_submit');

    await act(async () => {
      button('停止任务').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已取消');
    root.unmount();
    container.remove();
  });

  it('saves provider settings through the Settings UI and runtime boundary', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      providerSettings: {
        baseUrl: 'https://api.old.example/v1',
        model: 'gpt-old',
        apiKey: 'sk-old-secret'
      }
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('Base URL', 'https://api.new.example/v1');
      changeInput('Model', 'gpt-new');
      changeInput('API Key', 'sk-new-secret');
      button('Save').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await expectProviderSettings(runtime, {
      baseUrl: 'https://api.new.example/v1',
      model: 'gpt-new',
      apiKey: 'sk-new-secret'
    });
    expect(container.textContent).toContain('sk-...cret');
    expect(container.textContent).not.toContain('sk-new-secret');
    root.unmount();
    container.remove();
  });

  it('preserves existing provider API key when saving settings without a new key', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      providerSettings: {
        baseUrl: 'https://api.old.example/v1',
        model: 'gpt-old',
        apiKey: 'sk-existing-secret'
      }
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('Base URL', 'https://api.next.example/v1');
      changeInput('Model', 'gpt-next');
      button('Save').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await expectProviderSettings(runtime, {
      baseUrl: 'https://api.next.example/v1',
      model: 'gpt-next',
      apiKey: 'sk-existing-secret'
    });
    expect(container.textContent).toContain('sk-...cret');
    expect(container.textContent).not.toContain('sk-existing-secret');
    root.unmount();
    container.remove();
  });

  it('renders only the active tab and filters ref and interactive entries', async () => {
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
          structuredPageData: structuredData({
            refs: [
              {
                refId: 'ref_submit',
                role: 'button',
                name: '提交',
                tagName: 'button',
                visible: true,
                disabled: false
              },
              {
                refId: 'ref_cancel',
                role: 'button',
                name: '取消',
                tagName: 'button',
                visible: true,
                disabled: false
              }
            ],
            interactive: [
              {
                refId: 'ref_email',
                role: 'textbox',
                name: '邮箱',
                tagName: 'input',
                visible: true,
                disabled: false,
                warnings: []
              },
              {
                refId: 'ref_delete',
                role: 'button',
                name: '删除账号',
                tagName: 'button',
                visible: true,
                disabled: false,
                warnings: []
              }
            ]
          })
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

    expect(container.textContent).toContain('https://example.com/register');
    expect(container.textContent).not.toContain('ref_submit');

    await act(async () => {
      button('Ref 映射').click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('ref_submit');
    expect(container.textContent).toContain('ref_cancel');

    act(() => {
      changeInput('搜索 Ref', 'cancel');
    });
    expect(container.textContent).not.toContain('ref_submit');
    expect(container.textContent).toContain('ref_cancel');

    await act(async () => {
      button('交互元素').click();
      await Promise.resolve();
    });
    act(() => {
      changeInput('筛选交互元素', 'delete');
    });
    expect(container.textContent).not.toContain('ref_email');
    expect(container.textContent).toContain('ref_delete');
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
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('https://example.com/register');
    root.unmount();
    container.remove();
  });

  it('does not keep starting auto-observe runs after target tab data is ready', async () => {
    vi.useFakeTimers();
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
    const startRun = runtime.startRun.bind(runtime);
    const startInputs: unknown[] = [];
    runtime.startRun = async (input) => {
      startInputs.push(input);
      return startRun(input);
    };

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} targetTabId={99} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(startInputs).toHaveLength(1);
    root.unmount();
    container.remove();
    vi.useRealTimers();
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

  it('loads an existing run snapshot for approval inspection', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_existing',
          mode: 'act',
          status: 'waiting_for_approval',
          refs: [],
          pendingApproval: {
            id: 'apr_existing',
            runId: 'run_existing',
            stepId: 'step_1',
            tool: 'bh_iframe_click',
            argsPreview: { refId: 'frame_1:ref_1' },
            risk: 'high',
            reason: 'Delete account',
            actionPreview: 'Click Delete',
            status: 'pending',
            createdAt: 1
          }
        }
      ]
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} initialRunId="run_existing" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Click Delete');
    root.unmount();
    container.remove();
  });

  it('maps fine-grained runtime statuses into RunStateBadge labels', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_executing',
          mode: 'act',
          status: 'executing_tool',
          refs: []
        }
      ]
    });

    await act(async () => {
      root.render(<CockpitApp runtime={runtime} initialRunId="run_executing" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('执行工具');
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

function changeInput(label: string, value: string): void {
  const element = document.querySelector(`input[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${label}`);
  }
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set?.bind(element);
  setter?.(value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function expectProviderSettings(
  runtime: FakeRuntimePort,
  expected: { baseUrl: string; model: string; apiKey: string }
): Promise<void> {
  await expect(runtime.getProviderSettings()).resolves.toEqual(expected);
}

function structuredData(
  overrides: {
    refs?: StructuredPageData['refs']['items'];
    interactive?: StructuredPageData['interactive']['items'];
  } = {}
): StructuredPageData {
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
        ...(overrides.refs ?? [
          {
            refId: 'ref_submit',
            role: 'button',
            name: '提交',
            tagName: 'button',
            visible: true,
            disabled: false
          }
        ])
      ],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    },
    interactive: {
      status: overrides.interactive ? 'ready' as const : 'empty' as const,
      summary: overrides.interactive ? '检测到交互元素' : '无交互元素',
      count: overrides.interactive?.length ?? 0,
      items: overrides.interactive ?? [],
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
