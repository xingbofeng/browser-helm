// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';
import type { StructuredPageData } from '../../../../src/shared/schemas/structured-page-data.schema';
import { AdvancedDebugDrawer } from '../../../../src/ui/components/advanced-debug-drawer';
import { I18nProvider } from '../../../../src/i18n/context';
import { CockpitApp } from '../../../../src/ui/sidepanel/cockpit-app';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CockpitApp interaction', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
          streaming: {
            enabled: true,
            active: true,
            chunkCount: 1,
            fallbackUsed: false
          },
          structuredPageData: structuredData()
        }
      ]
    });
    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '检查当前页面');
      button('启动任务').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已完成页面观察');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).not.toContain('https://example.com/register');

    await act(async () => {
      button('高级开发者选项').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('元素与表单').click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('元素与表单');
    expect(document.body.textContent).toContain('ref_submit');

    await act(async () => {
      button('暂停回复').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已取消');
    root.unmount();
    container.remove();
  });

  it('starts with an empty composer and clears it after sending', async () => {
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
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });

    expect(input('任务').value).toBe('');

    await act(async () => {
      button('启动任务').click();
      await Promise.resolve();
    });
    expect(startRun).not.toHaveBeenCalled();

    await act(async () => {
      changeInput('任务', '检查 Apple 注册表单');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startRun).toHaveBeenCalledWith({
      task: '检查 Apple 注册表单',
      mode: 'ask',
      tabId: undefined
    });
    expect(input('任务').value).toBe('');
    root.unmount();
    container.remove();
  });

  it('lets users start a run in Full mode from the composer', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort();
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });

    await act(async () => {
      button('询问 / Ask').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('完整 / Full').click();
      changeInput('任务', '完整调试并执行必要动作');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startRun).toHaveBeenCalledWith({
      task: '完整调试并执行必要动作',
      mode: 'full',
      tabId: undefined
    });
    root.unmount();
    container.remove();
  });

  it('clears the current session from the header action', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'active_run',
          mode: 'ask',
          status: 'thinking',
          refs: [],
          messages: [
            {
              id: 'active_run:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '检查当前页面',
              createdAt: 1,
              updatedAt: 1
            },
            {
              id: 'active_run:agent',
              role: 'agent',
              kind: 'agent_status',
              status: 'streaming',
              title: 'BrowserHelm',
              content: '正在读取模型决策',
              createdAt: 2,
              updatedAt: 2
            }
          ],
          trace: [
            { runId: 'active_run', type: 'model_stream_started', timestamp: 2, payload: { model: 'gpt-test' } }
          ],
          structuredPageData: structuredData()
        }
      ]
    });
    const cancelRun = vi.spyOn(runtime, 'cancelRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="active_run" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('检查当前页面');
    expect(container.textContent).toContain('example.com');

    await act(async () => {
      changeInput('任务', '草稿也应该被清掉');
      button('清空会话').click();
      await Promise.resolve();
    });

    expect(cancelRun).toHaveBeenCalledWith('active_run');
    expect(input('任务').value).toBe('');
    expect(container.textContent).toContain('Ready');
    expect(container.textContent).not.toContain('检查当前页面');
    expect(container.textContent).not.toContain('example.com');
    root.unmount();
    container.remove();
  });

  it('continues an Ask mode action request in Act mode from the mode switch card', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'ask_blocked',
          targetTabId: 88,
          mode: 'ask',
          status: 'waiting_for_user',
          refs: [],
          messages: [
            {
              id: 'ask_blocked:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '帮我搜索下“最近的 agent 文章”',
              createdAt: 1,
              updatedAt: 1
            },
            {
              id: 'ask_blocked:mode-switch-request',
              role: 'agent',
              kind: 'recommendation',
              status: 'complete',
              title: '需要执行模式',
              content: '这个请求会改变页面内容。Ask 模式只读取和解释页面。',
              createdAt: 2,
              updatedAt: 2
            }
          ]
        }
      ]
    });
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="ask_blocked" targetTabId={999} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('需要执行模式');
    expect(container.textContent).toContain('切换到执行并继续');
    expect(container.textContent).toContain('保持 Ask');

    await act(async () => {
      button('切换到执行并继续').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const actStartInput = startRun.mock.calls.at(-1)?.[0];
    expect(actStartInput).toMatchObject({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act',
      tabId: 88
    });
    expect(actStartInput?.conversationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '帮我搜索下“最近的 agent 文章”' }),
      expect.objectContaining({ role: 'agent', content: '这个请求会改变页面内容。Ask 模式只读取和解释页面。' })
    ]));
    expect(container.textContent).not.toContain('需要执行模式');
    expect(container.textContent).not.toContain('切换到执行并继续');
    root.unmount();
    container.remove();
  });

  it('keeps previous user messages in the waterfall across multiple sends', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort();
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });

    await act(async () => {
      changeInput('任务', '第一次检查页面摘要');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '继续检查表单字段');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('第一次检查页面摘要');
    expect(container.textContent).toContain('继续检查表单字段');
    expect(container.textContent?.indexOf('第一次检查页面摘要')).toBeLessThan(
      container.textContent?.indexOf('继续检查表单字段') ?? -1
    );
    const secondStartInput = startRun.mock.calls.at(-1)?.[0];
    expect(secondStartInput?.task).toBe('继续检查表单字段');
    expect(secondStartInput?.conversationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '第一次检查页面摘要' })
    ]));
    root.unmount();
    container.remove();
  });

  it('passes all visible prior chat messages as continuation history', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'needs_values',
          mode: 'act',
          status: 'waiting_for_user',
          refs: [],
          messages: [
            {
              id: 'needs_values:observe-status',
              role: 'agent',
              kind: 'agent_status',
              status: 'complete',
              title: '页面观察',
              content: '已观察 Apple 注册页面。',
              createdAt: 0,
              updatedAt: 0
            },
            {
              id: 'needs_values:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '帮我填 Apple 注册表单',
              createdAt: 1,
              updatedAt: 1
            },
            {
              id: 'needs_values:error',
              role: 'agent',
              kind: 'error',
              status: 'error',
              title: '运行出错',
              content: '字段已有值，未覆盖。',
              createdAt: 2,
              updatedAt: 2
            },
            {
              id: 'needs_values:ask-user-required',
              role: 'agent',
              kind: 'recommendation',
              status: 'complete',
              title: '需要你提供具体字段值',
              content: '请提供姓氏、名字和邮箱。',
              createdAt: 3,
              updatedAt: 3
            }
          ]
        }
      ]
    });
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="needs_values" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '姓氏：Counter；名字：Xing；邮箱：name@example.com');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const nextStartInput = startRun.mock.calls.at(-1)?.[0];
    expect(nextStartInput?.conversationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'agent', title: '页面观察', content: '已观察 Apple 注册页面。' }),
      expect.objectContaining({ role: 'user', content: '帮我填 Apple 注册表单' }),
      expect.objectContaining({ role: 'agent', title: '运行出错', content: '字段已有值，未覆盖。' }),
      expect.objectContaining({ role: 'agent', title: '需要你提供具体字段值', content: '请提供姓氏、名字和邮箱。' })
    ]));
    root.unmount();
    container.remove();
  });

  it('passes previous run trace as full continuation history', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'tool_history',
          mode: 'act',
          status: 'finished',
          refs: [],
          messages: [
            {
              id: 'tool_history:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '帮我搜索 agent 文章',
              createdAt: 1,
              updatedAt: 1
            }
          ],
          trace: [
            {
              runId: 'tool_history',
              type: 'tool_started',
              timestamp: 10,
              payload: {
                tool: 'bh_form_fill_many',
                args: {
                  fields: [{ fieldRefId: 'ref_search', value: 'agent 文章' }]
                }
              }
            },
            {
              runId: 'tool_history',
              type: 'tool_result',
              timestamp: 20,
              payload: {
                tool: 'bh_form_fill_many',
                ok: true,
                summary: '填写成功 1/1 个字段'
              }
            }
          ]
        }
      ]
    });
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="tool_history" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '继续看看结果');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const nextStartInput = startRun.mock.calls.at(-1)?.[0];
    const traceHistory = nextStartInput?.conversationHistory?.find((item) =>
      item.role === 'system' && item.title === 'Previous run trace'
    );
    expect(traceHistory?.content).toContain('bh_form_fill_many');
    expect(traceHistory?.content).toContain('ref_search');
    expect(traceHistory?.content).toContain('填写成功 1/1 个字段');
    root.unmount();
    container.remove();
  });

  it('merges current snapshot messages into continuation history before sending', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'snapshot_history',
          mode: 'act',
          status: 'waiting_for_user',
          refs: [],
          messages: [
            {
              id: 'snapshot_history:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '帮我填 Apple 注册表单',
              createdAt: 1,
              updatedAt: 1
            },
            {
              id: 'snapshot_history:ask-user-required',
              role: 'agent',
              kind: 'recommendation',
              status: 'complete',
              title: '需要你提供具体字段值',
              content: '请提供姓氏、名字和邮箱。',
              createdAt: 2,
              updatedAt: 2
            }
          ]
        }
      ]
    });
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="snapshot_history" /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', 'counterxing');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const nextStartInput = startRun.mock.calls.at(-1)?.[0];
    expect(nextStartInput?.conversationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '帮我填 Apple 注册表单' }),
      expect.objectContaining({ role: 'agent', title: '需要你提供具体字段值', content: '请提供姓氏、名字和邮箱。' })
    ]));
    root.unmount();
    container.remove();
  });

  it('keeps the initial automatic observation once before user chat messages', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'auto_seed',
          mode: 'ask',
          status: 'observed',
          refs: []
        },
        {
          runId: 'user_seed',
          mode: 'ask',
          status: 'observed',
          refs: []
        }
      ]
    });
    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} targetTabId={123} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已完成页面观察');
    expect(container.textContent).not.toContain('观察当前页面');

    await act(async () => {
      changeInput('任务', 'hello');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('hello');
    expect(container.textContent).not.toContain('观察当前页面');
    expect(container.textContent).toContain('已完成页面观察');
    expect(container.querySelectorAll('[data-message-kind="page_summary"]')).toHaveLength(1);
    expect(container.textContent?.indexOf('已完成页面观察')).toBeLessThan(
      container.textContent?.indexOf('hello') ?? -1
    );
    root.unmount();
    container.remove();
  });

  it('renders the page observation card even when runtime messages omit page_summary', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_without_page_message',
          mode: 'ask',
          status: 'observed',
          refs: [],
          structuredPageData: structuredData(),
          messages: [
            {
              id: 'run_without_page_message:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '总结页面',
              createdAt: 1,
              updatedAt: 1
            }
          ]
        }
      ]
    });
    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_without_page_message" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('总结页面');
    expect(container.textContent).toContain('已完成页面观察');
    expect(container.querySelectorAll('[data-message-kind="page_summary"]')).toHaveLength(1);
    root.unmount();
    container.remove();
  });

  it('shows a specific running card with elapsed time while a tool is executing', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_executing_tool',
          mode: 'ask',
          status: 'executing_tool',
          refs: [],
          trace: [
            {
              runId: 'run_executing_tool',
              type: 'tool_started',
              timestamp: Date.now() - 2_000,
              payload: {
                tool: 'bh_page_read_article'
              }
            }
          ],
          messages: [
            {
              id: 'run_executing_tool:task',
              role: 'user',
              kind: 'task',
              status: 'complete',
              content: '读页面',
              createdAt: 1,
              updatedAt: 1
            }
          ]
        }
      ]
    });

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_executing_tool" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('正在执行动作');
    expect(container.textContent).toContain('正在运行 bh_page_read_article');
    root.unmount();
    container.remove();
  });

  it('delegates vision capture to runtime without requesting optional debugger permission', async () => {
    const request = vi.fn(async (
      _request: unknown,
      callback: (granted: boolean) => void
    ) => callback(false));
    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn(async (
          _request: unknown,
          callback: (granted: boolean) => void
        ) => callback(false)),
        request
      }
    });
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
    const executeTool = vi.spyOn(runtime, 'executeTool');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="seed" targetTabId={99} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      button('高级开发者选项').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('视觉检查').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('截取视口').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'bh_vision_capture_viewport'
    }));
    expect(request).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('用户未授予 debugger 权限');
    root.unmount();
    container.remove();
  });

  it('keeps background auto-observe retries out of the chat waterfall', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const retryStructuredData = structuredData();
    const retryObservationItem = retryStructuredData.observation.items[0];
    if (!retryObservationItem) {
      throw new Error('Expected structured observation fixture item');
    }
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'auto_seed',
          mode: 'ask',
          status: 'observed',
          refs: [],
          observation: {
            url: 'https://example.com/iframe-host',
            title: 'iframe host',
            currentDomain: 'example.com',
            origin: 'https://example.com',
            visibleTextSummary: 'iframe host',
            pageStateSummary: '页面包含 iframe',
            interactiveCount: 0,
            warnings: []
          }
        },
        {
          runId: 'user_seed',
          mode: 'ask',
          status: 'observed',
          refs: []
        },
        {
          runId: 'auto_retry_seed',
          mode: 'ask',
          status: 'observed',
          refs: [],
          structuredPageData: {
            ...retryStructuredData,
            observation: {
              ...retryStructuredData.observation,
              items: [
                {
                  ...retryObservationItem,
                  title: 'GitHub',
                  currentDomain: 'github.com',
                  pageStateSummary: '页面包含 686 个可交互元素'
                }
              ]
            }
          }
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} targetTabId={123} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      changeInput('任务', 'hello');
      button('启动任务').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('hello');
    expect(container.querySelectorAll('[data-message-kind="page_summary"]')).toHaveLength(1);
    expect(startInputs).toHaveLength(2);
    expect(startInputs).toEqual([
      expect.objectContaining({ task: '观察当前页面', runKind: 'observe_only' }),
      expect.objectContaining({ task: 'hello' })
    ]);
    expect(container.textContent).not.toContain('GitHub');
    expect(container.textContent).not.toContain('686 个可交互元素');
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      button('打开模型配置').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('大模型设置').click();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('Base URL', 'https://api.new.example/v1');
      changeInput('Model', 'gpt-new');
      changeInput('API Key', 'sk-new-secret');
      button('保存配置').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await expectProviderSettings(runtime, {
      baseUrl: 'https://api.new.example/v1',
      model: 'gpt-new',
      apiKey: 'sk-new-secret',
      apiKeyPersistence: 'local',
      streamingEnabled: true,
      allowLocalProviderEndpoints: false
    });
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      button('打开模型配置').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('大模型设置').click();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('Base URL', 'https://api.next.example/v1');
      changeInput('Model', 'gpt-next');
      button('保存配置').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await expectProviderSettings(runtime, {
      baseUrl: 'https://api.next.example/v1',
      model: 'gpt-next',
      apiKey: 'sk-existing-secret',
      apiKeyPersistence: 'local',
      streamingEnabled: true,
      allowLocalProviderEndpoints: false
    });
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '点击删除账号');
      button('启动任务').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已完成页面观察');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).not.toContain('https://example.com/register');
    expect(container.textContent).not.toContain('ref_submit');

    await act(async () => {
      button('高级开发者选项').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('元素与表单').click();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('ref_submit');
    expect(document.body.textContent).toContain('ref_cancel');
    const highlightRef = vi.spyOn(runtime, 'highlightRef');
    await act(async () => {
      button('取消').click();
      await Promise.resolve();
    });
    expect(highlightRef).toHaveBeenCalledWith({
      runId: 'fake_run_1',
      refId: 'ref_cancel'
    });

    act(() => {
      changeInput('搜索元素与表单', 'cancel');
    });
    expect(document.body.textContent).not.toContain('ref_submit');
    expect(document.body.textContent).toContain('ref_cancel');

    await act(async () => {
      chip('按钮').click();
      await Promise.resolve();
    });
    act(() => {
      changeInput('搜索元素与表单', 'delete');
    });
    expect(document.body.textContent).not.toContain('ref_email');
    expect(document.body.textContent).toContain('ref_delete');
    root.unmount();
    container.remove();
  });

  it('forwards element inspection from the collapsible advanced debug drawer', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onInspectElement = vi.fn();

    await act(async () => {
      root.render(
        <I18nProvider initialLocale="zh">
        <AdvancedDebugDrawer
          structuredPageData={structuredData({
            interactive: [
              {
                refId: 'ref_cancel',
                role: 'button',
                name: '取消',
                tagName: 'button',
                visible: true,
                disabled: false,
                warnings: []
              }
            ]
          })}
          onInspectElement={onInspectElement}
        />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      button('高级开发者选项').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('元素与表单').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('取消').click();
      await Promise.resolve();
    });

    expect(onInspectElement).toHaveBeenCalledWith('ref_cancel');
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} targetTabId={99} /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('已完成页面观察');
    expect(container.textContent).not.toContain('观察当前页面');
    expect(container.textContent).not.toContain('https://example.com/register');
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} targetTabId={99} /></I18nProvider>);
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '点击删除账号');
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
    expect(countText(container.textContent ?? '', 'USER_DENIED_APPROVAL')).toBe(1);
    expect(container.querySelector('.bh-approvalResult[role="status"]')?.textContent).toContain(
      'USER_DENIED_APPROVAL'
    );
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_existing" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Click Delete');
    root.unmount();
    container.remove();
  });

  it('lets users edit a submit approval field and re-run form tools', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_form_approval',
          mode: 'form',
          status: 'waiting_for_approval',
          refs: [],
          pendingApproval: {
            id: 'apr_form',
            runId: 'run_form_approval',
            stepId: 'step_submit',
            tool: 'bh_form_submit_with_approval',
            argsPreview: {
              formName: 'Registration',
              submitMethod: 'button-click',
              submitTargetRefId: 'ref_submit',
              verifyStatus: 'pass',
              verifyFailed: false,
              fieldCount: 1,
              filledCount: 1,
              skippedCount: 0,
              riskExplanation: '确认提交',
              fields: [
                {
                  fieldRefId: 'ref_name',
                  label: 'Full Name',
                  name: 'name',
                  type: 'text',
                  valuePreview: 'Old Name',
                  isSensitive: false
                }
              ],
              warnings: []
            },
            risk: 'high',
            reason: 'Confirm form submit: Registration',
            actionPreview: 'Submit form: Registration',
            status: 'pending',
            createdAt: 1
          }
        }
      ]
    });
    const executeTool = vi.spyOn(runtime, 'executeTool');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_form_approval" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      button('显示字段值').click();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('修改字段 Full Name', 'New Name');
      button('应用字段修改').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(executeTool).toHaveBeenNthCalledWith(1, {
      runId: 'run_form_approval',
      tool: 'bh_form_fill_field',
      args: {
        fieldRefId: 'ref_name',
        value: 'New Name'
      }
    });
    expect(executeTool).toHaveBeenNthCalledWith(2, {
      runId: 'run_form_approval',
      tool: 'bh_form_verify',
      args: {
        fieldRefIds: ['ref_name'],
        submitRefId: 'ref_submit'
      }
    });
    expect(executeTool).toHaveBeenNthCalledWith(3, expect.objectContaining({
      runId: 'run_form_approval',
      tool: 'bh_form_submit_with_approval'
    }));
    const thirdCall = (executeTool.mock.calls as unknown as Array<[
      {
        args?: {
          fields?: Array<{
            fieldRefId?: string | undefined;
            valuePreview?: string | undefined;
          }>;
        };
      }
    ]>)[2]?.[0];
    expect(thirdCall?.args?.fields?.[0]).toMatchObject({
      fieldRefId: 'ref_name',
      valuePreview: 'New Name'
    });
    root.unmount();
    container.remove();
  });

  it('does not start a duplicate auto-observe run when an initial run id is present', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_existing',
          mode: 'ask',
          status: 'observed',
          refs: [],
          structuredPageData: structuredData()
        }
      ]
    });
    const startRun = vi.spyOn(runtime, 'startRun');

    await act(async () => {
      root.render(
        <I18nProvider initialLocale="zh">
        <CockpitApp
          runtime={runtime}
          initialRunId="run_existing"
          targetTabId={99}
        />
        </I18nProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startRun).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it('does not show the runtime goal revision entry in the main composer', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_existing',
          mode: 'form',
          status: 'thinking',
          refs: [],
          canReviseGoal: true,
          structuredPageData: structuredData()
        }
      ]
    });
    const reviseGoal = vi.spyOn(runtime, 'reviseGoal');

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_existing" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      changeInput('任务', '改为只检查提交按钮为什么不可用');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviseGoal).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('当前 run 可修改目标');
    expect(container.textContent).not.toContain('修改目标');
    root.unmount();
    container.remove();
  });

  it('hides the revise-goal bar after a run is complete', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'run_complete',
          mode: 'form',
          status: 'observed',
          refs: [],
          canReviseGoal: true,
          structuredPageData: structuredData()
        }
      ]
    });

    await act(async () => {
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_complete" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('当前 run 可修改目标');
    root.unmount();
    container.remove();
  });

  it('maps fine-grained runtime statuses into the header status label', async () => {
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
      root.render(<I18nProvider initialLocale="zh"><CockpitApp runtime={runtime} initialRunId="run_executing" /></I18nProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Running');
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
  const element = input(label);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set?.bind(element);
  setter?.(value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function input(label: string): HTMLInputElement {
  const element = document.querySelector(`input[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${label}`);
  }
  return element;
}

function chip(name: string): HTMLButtonElement {
  const element = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Chip not found: ${name}`);
  }
  return element;
}

async function expectProviderSettings(
  runtime: FakeRuntimePort,
  expected: {
    baseUrl: string;
    model: string;
    apiKey: string;
    apiKeyPersistence?: 'session' | 'local';
    streamingEnabled?: boolean;
    allowLocalProviderEndpoints?: boolean;
  }
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

function countText(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
