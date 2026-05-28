// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentMessageList } from '../../../src/ui/components/agent-message-list';
import { I18nProvider } from '../../../src/i18n/context';
import type { RunSnapshot } from '../../../src/runtime/runtime-messages';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* eslint-disable @typescript-eslint/unbound-method */

function mkObsSnapshot(overrides: Record<string, unknown> = {}): RunSnapshot {
  const base = {
    runId: 'test-run',
    mode: 'ask',
    status: 'observed',
    messages: [],
    refs: [],
    observation: {
      title: '默认',
      url: 'https://default.example',
      origin: 'https://default.example',
      currentDomain: 'default.example',
      visibleTextSummary: '默认可见文本',
      pageStateSummary: '默认页面状态',
      interactiveCount: 0,
      warnings: [] as string[]
    },
    structuredPageData: {
      observation: {
        status: 'ready',
        summary: '默认',
        count: 0,
        updatedAt: '0',
        warnings: [],
        items: []
      },
      refs: {
        status: 'ready',
        summary: '默认',
        count: 0,
        updatedAt: '0',
        warnings: [],
        items: []
      },
      forms: {
        status: 'ready',
        summary: '默认',
        count: 0,
        updatedAt: '0',
        warnings: [],
        items: []
      }
    },
    trace: [],
    ...overrides
  };
  return base as unknown as RunSnapshot;
}

describe('QA 卡片 / 页面观察卡组件', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function render(snapshot?: RunSnapshot): { container: HTMLElement; unmount(): void } {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<I18nProvider initialLocale="en"><AgentMessageList snapshot={snapshot} /></I18nProvider>);
    });
    return { container, unmount: () => root.unmount() };
  }

  it('页面观察默认使用问答卡片类组件', () => {
    const snapshot = mkObsSnapshot({
      observation: {
        title: '测试页面',
        currentDomain: 'example.com',
        url: 'https://example.com/test',
        pageStateSummary: '这是一个测试页面的摘要',
        interactiveCount: 5
      }
    });
    const { container, unmount } = render(snapshot);

    expect(container.querySelector('.bh-qaCard')).toBeTruthy();
    expect(container.textContent).toContain('Page observation completed');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).not.toContain('https://example.com/test');
    unmount();
  });

  it('成功卡显示统计 chips', () => {
    const snapshot = mkObsSnapshot({
      observation: {
        title: '测试页面',
        currentDomain: 'example.com',
        pageStateSummary: '摘要',
        interactiveCount: 10
      },
      structuredPageData: {
        observation: {
          status: 'ready', summary: '默认', count: 1, updatedAt: '0', warnings: [],
          items: [{
            title: '测试页面', currentDomain: 'example.com',
            visibleTextSummary: '页面文本内容摘要', interactiveCount: 10,
            url: 'https://example.com/test', origin: 'https://example.com'
          }]
        },
        refs: {
          status: 'ready', summary: '默认', count: 3, updatedAt: '0', warnings: [],
          items: [
            { refId: 'ref-1', role: 'link', tagName: 'a', name: 'Link 1' },
            { refId: 'ref-2', role: 'link', tagName: 'a', name: 'Link 2' },
            { refId: 'ref-3', role: 'button', tagName: 'button', name: 'Btn' }
          ]
        },
        forms: { status: 'ready', summary: '默认', count: 1, updatedAt: '0', warnings: [], items: [{}] }
      }
    });
    const { container, unmount } = render(snapshot);

    expect(container.querySelector('.bh-pageObservationStats')).toBeTruthy();
    expect(container.textContent).toContain('Links');
    expect(container.textContent).toContain('Forms');
    expect(container.textContent).toContain('Text');
    unmount();
  });

  it('错误卡 visual 结构正常（data-message-kind="error"）', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'failed',
      messages: [{
        id: 'test-run:fallback', role: 'agent', kind: 'error', status: 'error',
        title: '运行遇到问题', content: '页面观察失败：Content script 不可用',
        createdAt: 0, updatedAt: 0
      }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).toContain('页面观察失败');
    expect(container.querySelector('[data-message-kind="error"]')).toBeTruthy();
    unmount();
  });

  it('观察卡含时间信息', () => {
    const now = Date.now();
    const snapshot = mkObsSnapshot({
      observation: { title: '测试页面', currentDomain: 'example.com' },
      structuredPageData: {
        observation: {
          status: 'ready', summary: '默认', count: 1, updatedAt: String(now), warnings: [],
          items: [{ title: '测试页面', currentDomain: 'example.com', url: 'https://example.com', origin: 'https://example.com' }]
        },
        refs: { status: 'ready', summary: '默认', count: 0, updatedAt: '0', warnings: [], items: [] },
        forms: { status: 'ready', summary: '默认', count: 0, updatedAt: '0', warnings: [], items: [] }
      }
    });
    const { container, unmount } = render(snapshot);
    expect(container.querySelector('time')).toBeTruthy();
    unmount();
  });

  it('无 snapshot 时显示欢迎状态', () => {
    const { container, unmount } = render(undefined);
    expect(container.textContent).toContain('Ready to observe page');
    expect(container.textContent).toContain('BrowserHelm');
    unmount();
  });

  it('无 observation items 但有 observation 时显示兜底页面摘要卡', () => {
    const snapshot = mkObsSnapshot({
      observation: { title: '从 snapshot 标题派生', currentDomain: 'derived.example' }
    });
    const { container, unmount } = render(snapshot);
    expect(container.querySelector('.bh-qaCard')).toBeTruthy();
    expect(container.textContent).toContain('derived.example');
    unmount();
  });

  it('运行状态块在 agent 回复前显示，且不重复显示进度卡', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      messages: [
        {
          id: 'test-run:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '请检查当前页面',
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'test-run:provider-response',
          role: 'agent',
          kind: 'agent_status',
          status: 'streaming',
          title: 'BrowserHelm',
          content: '正在整理回答',
          createdAt: 2,
          updatedAt: 2
        }
      ],
      trace: [{ runId: 'test-run', type: 'model_stream_started', timestamp: Date.now(), payload: {} }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const flow = container.querySelector('.bh-runFlow');
    const reply = Array.from(container.querySelectorAll('.bh-agentMessage')).find((node) =>
      node.textContent?.includes('正在整理回答')
    );
    expect(flow).toBeTruthy();
    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    expect(flow?.compareDocumentPosition(reply as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.textContent).toContain('Thinking');
    unmount();
  });

  it('thinking 状态块显示最近一步 trace 动作，而不是固定文案', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        { runId: 'test-run', type: 'turn_started', timestamp: 100, payload: { stepIndex: 0 } },
        { runId: 'test-run', type: 'tools_selected', timestamp: 200, payload: { toolCount: 4 } },
        { runId: 'test-run', type: 'context_built', timestamp: 300, payload: { messageCount: 2 } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('BrowserHelm is packaging the page');
    expect(container.textContent).not.toContain('AI choosing next action');
    unmount();
  });

  it('model streaming 状态块显示读取输出', () => {
    vi.useFakeTimers();
    vi.setSystemTime(11_500);
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: 1_000, payload: { model: 'gpt-test' } },
        { runId: 'test-run', type: 'model_stream_delta', timestamp: 11_000, payload: { charCount: 42 } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('42');
    expect(container.textContent).not.toContain('AI choosing next action');
    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    unmount();
  });

  it('模型刚开始输出时状态块显示 trace 阶段而不是 0 字符', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: 1_000, payload: { model: 'deepseek-v4-flash' } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('The model deepseek-v4-flash is preparing the next safe step.');
    expect(container.textContent).not.toContain('received 0 characters');
    unmount();
  });

  it('模型输出片段时状态块显示已接收字符数', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: 1_000, payload: { model: 'deepseek-v4-flash' } },
        { runId: 'test-run', type: 'model_stream_delta', timestamp: 2_000, payload: { charCount: 40 } },
        { runId: 'test-run', type: 'model_stream_delta', timestamp: 3_000, payload: { charCount: 60 } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('received 100 characters so far.');
    unmount();
  });

  it('模型流式请求失败时在回复前显示具体错误和 fallback 状态', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      messages: [
        {
          id: 'test-run:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '帮我总结当前页面',
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'test-run:provider-response',
          role: 'agent',
          kind: 'agent_status',
          status: 'streaming',
          title: 'BrowserHelm',
          content: '正在准备回答',
          createdAt: 2,
          updatedAt: 2
        }
      ],
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: 1_000, payload: { model: 'moonshotai/kimi-k2.6:free' } },
        {
          runId: 'test-run',
          type: 'model_stream_failed',
          timestamp: 2_000,
          payload: { summary: 'Model stream request failed with status 429' }
        },
        {
          runId: 'test-run',
          type: 'model_stream_fallback_started',
          timestamp: 2_100,
          payload: { reason: 'stream_failed: Model stream request failed with status 429' }
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const flow = container.querySelector('.bh-runFlow');
    const reply = Array.from(container.querySelectorAll('.bh-agentMessage')).find((node) =>
      node.textContent?.includes('正在准备回答')
    );

    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    expect(container.textContent).toContain('Model stream request failed with status 429');
    expect(container.textContent).toContain('Retrying model request');
    expect(flow?.compareDocumentPosition(reply as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    unmount();
  });

  it('解析失败时状态块显示最近 trace 错误阶段', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        {
          runId: 'test-run',
          type: 'decision_parse_failed',
          timestamp: 4_000,
          payload: {
            stepIndex: 0,
            repairAttempt: 0,
            parseError: { code: 'MODEL_OUTPUT_SCHEMA_INVALID' }
          }
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).toContain('Repairing decision');
    expect(container.textContent).toContain('BrowserHelm rejected the previous decision');
    unmount();
  });

  it('在 waterfall 中以单一回复状态展示最新动作和耗时', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        { runId: 'test-run', type: 'turn_started', timestamp: 1_000, payload: { stepIndex: 0 } },
        { runId: 'test-run', type: 'context_built', timestamp: 1_050, payload: { messageCount: 2 } },
        { runId: 'test-run', type: 'model_stream_started', timestamp: 1_100, payload: { model: 'gpt-test' } },
        { runId: 'test-run', type: 'model_stream_delta', timestamp: 1_150, payload: { charCount: 42 } },
        {
          runId: 'test-run',
          type: 'tool_started',
          timestamp: 1_200,
          payload: { tool: 'bh_form_read_fields', args: {} }
        },
        {
          runId: 'test-run',
          type: 'tool_result',
          timestamp: 1_323,
          payload: {
            tool: 'bh_form_read_fields',
            ok: true,
            code: 'OK',
            summary: 'Read 3 fields'
          }
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.querySelector('.bh-runFlow')).toBeTruthy();
    expect(container.querySelector('.bh-runFlowItem')).toBeNull();
    expect(container.textContent).toContain('Running action');
    expect(container.textContent).toContain('Read 3 fields');
    expect(container.textContent).toContain('123 ms');
    expect(container.textContent).not.toContain('Preparing page context');
    unmount();
  });

  it('终态回复出现后不再显示运行状态块', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'finished',
      toolResult: {
        tool: 'bh_form_fill_many',
        ok: true,
        code: 'OK',
        summary: '填写成功 1/1 个字段'
      },
      messages: [
        {
          id: 'test-run:agent-final',
          role: 'agent',
          kind: 'agent_status',
          status: 'complete',
          title: 'BrowserHelm',
          content: '这是最终 AI 回复，应当是页面里的主要内容。',
          createdAt: 2_000,
          updatedAt: 2_000
        }
      ],
      trace: [
        { runId: 'test-run', type: 'turn_started', timestamp: 100, payload: { stepIndex: 0 } },
        { runId: 'test-run', type: 'context_built', timestamp: 110, payload: { messageCount: 2 } },
        { runId: 'test-run', type: 'tool_started', timestamp: 120, payload: { tool: 'bh_form_fill_many' } },
        { runId: 'test-run', type: 'tool_result', timestamp: 130, payload: { tool: 'bh_form_fill_many', ok: true, summary: 'filled' } },
        { runId: 'test-run', type: 'turn_started', timestamp: 300, payload: { stepIndex: 1 } },
        { runId: 'test-run', type: 'context_built', timestamp: 310, payload: { messageCount: 2 } },
        { runId: 'test-run', type: 'model_stream_started', timestamp: 320, payload: { model: 'gpt-test' } },
        { runId: 'test-run', type: 'model_stream_finished', timestamp: 420, payload: { model: 'gpt-test', charCount: 128 } },
        { runId: 'test-run', type: 'model_decision', timestamp: 430, payload: { decision: { type: 'finish' } } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const flow = container.querySelector('.bh-runFlow');
    const finalText = Array.from(container.querySelectorAll('.bh-agentMessage')).find((node) =>
      node.textContent?.includes('这是最终 AI 回复')
    );

    expect(container.querySelector('.bh-runFlowItem')).toBeNull();
    expect(container.textContent).not.toContain('bh_form_fill_many');
    expect(container.querySelector('.bh-formCard')).toBeNull();
    expect(flow).toBeNull();
    expect(finalText).toBeTruthy();
    unmount();
  });

  it('waiting_for_user 是终态，回复后不再显示运行状态块', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'waiting_for_user',
      messages: [
        {
          id: 'test-run:ask-user',
          role: 'agent',
          kind: 'recommendation',
          status: 'complete',
          title: '需要你提供具体字段值',
          content: '请告诉我要填写什么。',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: 100, payload: { model: 'gpt-test' } },
        { runId: 'test-run', type: 'model_stream_finished', timestamp: 200, payload: { model: 'gpt-test' } }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).not.toContain('Waiting for your input');
    expect(container.textContent).not.toContain('AI choosing next action');
    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    expect(container.querySelector('.bh-runFlow')).toBeNull();
    expect(container.textContent).toContain('需要你提供具体字段值');
    unmount();
  });

  it('用户上翻后进度计时更新不会强制滚到底部', async () => {
    vi.useFakeTimers();
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [{ runId: 'test-run', type: 'model_stream_started', timestamp: Date.now(), payload: {} }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const waterfall = container.querySelector('.bh-agentWaterfall') as HTMLElement;
    Object.defineProperty(waterfall, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(waterfall, 'clientHeight', { configurable: true, value: 200 });
    waterfall.scrollTop = 100;
    act(() => {
      waterfall.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(1000);
    });
    await Promise.resolve();

    expect(waterfall.scrollTop).toBe(100);
    unmount();
  });

  it('字段填写成功后等待下一步时显示正在确认填写结果', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        {
          runId: 'test-run',
          type: 'tool_result',
          timestamp: 100,
          payload: {
            tool: 'bh_form_fill_many',
            ok: true,
            summary: '填写成功 1/1 个字段'
          }
        },
        {
          runId: 'test-run',
          type: 'model_stream_started',
          timestamp: 200,
          payload: { model: 'gpt-test' }
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('The model gpt-test is preparing the next safe step.');
    expect(container.textContent).not.toContain('AI choosing next action');
    unmount();
  });

  it('单字段填写成功后等待下一步时显示正在确认填写结果', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [
        {
          runId: 'test-run',
          type: 'tool_result',
          timestamp: 100,
          payload: {
            tool: 'bh_form_fill_field',
            ok: true,
            summary: 'Filled field ref_101'
          }
        },
        {
          runId: 'test-run',
          type: 'model_stream_started',
          timestamp: 200,
          payload: { model: 'gpt-test' }
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('The model gpt-test is preparing the next safe step.');
    expect(container.textContent).not.toContain('AI choosing next action');
    unmount();
  });

  it('executing_tool 时状态块显示具体工具动作', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'executing_tool',
      trace: [{ runId: 'test-run', type: 'tool_started', payload: { tool: 'bh_page_read_article' }, timestamp: Date.now() }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('bh_page_read_article');
    expect(container.textContent).toContain('BrowserHelm is running bh_page_read_article.');
    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    unmount();
  });

  it('运行结束后不显示进度卡', () => {
    const snapshot: RunSnapshot = { ...mkObsSnapshot(), status: 'finished', trace: [] } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.querySelector('.bh-runProgressCard')).toBeNull();
    unmount();
  });

  it('streaming 状态显示生成中', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      messages: [{
        id: 'test-run:stream-msg', role: 'agent', kind: 'agent_status', status: 'streaming',
        title: '回答', content: '正在生成中...', createdAt: 0, updatedAt: 0
      }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.querySelector('.bh-streamingDots')).toBeTruthy();
    unmount();
  });

  it('元素列表和统计 chips 正确', () => {
    const snapshot = mkObsSnapshot({
      observation: { title: '统计测试', currentDomain: 'example.com', pageStateSummary: '包含各种可交互元素', interactiveCount: 8 },
      structuredPageData: {
        observation: {
          status: 'ready', summary: '默认', count: 1, updatedAt: '0', warnings: [],
          items: [{ title: '统计测试', currentDomain: 'example.com', visibleTextSummary: '文本', interactiveCount: 8, url: 'https://example.com', origin: 'https://example.com' }]
        },
        refs: {
          status: 'ready', summary: '默认', count: 4, updatedAt: '0', warnings: [],
          items: [
            { refId: 'r1', role: 'link', tagName: 'a', name: 'Link1' },
            { refId: 'r2', role: 'link', tagName: 'a', name: 'Link2' },
            { refId: 'r3', role: 'link', tagName: 'a', name: 'Link3' },
            { refId: 'r4', role: 'button', tagName: 'button', name: 'Btn' }
          ]
        },
        forms: { status: 'ready', summary: '默认', count: 2, updatedAt: '0', warnings: [], items: [{}, {}] }
      }
    });
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('Links 3');
    expect(container.textContent).toContain('Forms 2');
    unmount();
  });

  it('消息有 reasoning 时渲染折叠的思考过程区段', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'finished',
      messages: [{
        id: 'test-run:with-reasoning',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: 'BrowserHelm',
        content: '最终回答文本。',
        reasoning: '第一步：观察页面。第二步：分析表单。第三步：得出结论。',
        createdAt: 1,
        updatedAt: 2
      }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    // 思考过程以折叠形式展示
    expect(container.textContent).toContain('最终回答文本。');
    expect(container.textContent).toContain('Reasoning');
    expect(container.querySelector('details')).toBeTruthy();
    expect(container.textContent).toContain('观察页面');
    unmount();
  });

  it('消息无 reasoning 时不渲染思考过程区段', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'finished',
      messages: [{
        id: 'test-run:no-reasoning',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: 'BrowserHelm',
        content: '简单回答。',
        createdAt: 1,
        updatedAt: 2
      }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('Reasoning');
    expect(container.querySelector('details')).toBeNull();
    unmount();
  });

  it('不把非协议 JSON 决策原文渲染成最终回复', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'failed',
      streaming: {
        active: false,
        finalText: JSON.stringify({
          type: 'multi',
          actions: [
            {
              type: 'tool_call',
              tool: 'bh_form_fill_many',
              args: {
                fields: [{ fieldRefId: 'ref_name', value: '张三' }]
              }
            }
          ],
          finish: {
            message: '已填写所有字段。',
            success: true
          }
        }),
        finishedAt: 1710000000000
      }
    } as unknown as RunSnapshot;

    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('bh_form_fill_many');
    expect(container.textContent).not.toContain('已填写所有字段。');
    unmount();
  });

  it('不显示历史里残留的原始 provider decision JSON 消息', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      messages: [{
        id: 'test-run:provider-response',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: 'BrowserHelm',
        content: JSON.stringify({
          type: 'decision',
          decision: 'finish',
          finish: {
            message: '这段最终回答应该由 agent-final 展示，而不是 JSON。'
          }
        }),
        createdAt: 1,
        updatedAt: 2
      }],
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: Date.now(), payload: {} }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('"decision"');
    expect(container.textContent).not.toContain('这段最终回答应该由 agent-final 展示');
    unmount();
  });

  it('不把 needs_user_input 协议 JSON 闪现成 AI 回复', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'waiting_for_user',
      streaming: {
        active: false,
        finalText: JSON.stringify({
          type: 'needs_user_input',
          message: '请提供具体字段值。'
        }),
        finishedAt: 1710000000000
      }
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('needs_user_input');
    expect(container.textContent).not.toContain('请提供具体字段值。');
    unmount();
  });

  it('流式中的协议 JSON 片段也不会作为普通回复展示', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      messages: [{
        id: 'test-run:provider-response',
        role: 'agent',
        kind: 'agent_status',
        status: 'streaming',
        title: 'BrowserHelm',
        content: '{"type":"needs_user_input","message":"请提供',
        createdAt: 1,
        updatedAt: 2
      }],
      trace: [
        { runId: 'test-run', type: 'model_stream_started', timestamp: Date.now(), payload: {} }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('needs_user_input');
    expect(container.textContent).not.toContain('请提供');
    unmount();
  });

  it('表单填写计划失败时不暴露内部工具参数错误', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'waiting_for_user',
      toolResult: {
        tool: 'bh_form_infer_fill_plan',
        ok: false,
        code: 'TOOL_ARGS_INVALID',
        summary: 'Tool args invalid for bh_form_infer_fill_plan'
      }
    } as unknown as RunSnapshot;

    const { container, unmount } = render(snapshot);

    expect(container.textContent).not.toContain('Tool args invalid');
    expect(container.textContent).not.toContain('bh_form_infer_fill_plan');
    expect(container.textContent).toContain('specific field values');
    unmount();
  });

  it('页面观察卡固定显示在会话开头，不插入用户和回答之间', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'finished',
      messages: [
        {
          id: 'test-run:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '总结下这个页面',
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'test-run:provider-response',
          role: 'agent',
          kind: 'agent_status',
          status: 'complete',
          title: 'BrowserHelm',
          content: '这是最终回答。',
          createdAt: 3,
          updatedAt: 3
        },
        {
          id: 'test-run:page-summary',
          role: 'agent',
          kind: 'page_summary',
          status: 'complete',
          title: 'Page observation completed',
          content: '当前页面看起来是测试页。',
          createdAt: 4,
          updatedAt: 4
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const text = container.textContent ?? '';

    expect(text.indexOf('Page observation completed')).toBeLessThan(text.indexOf('总结下这个页面'));
    expect(text.indexOf('总结下这个页面')).toBeLessThan(text.indexOf('这是最终回答。'));
    unmount();
  });

  it('多轮补充时页面观察卡不会把最新用户消息挪到旧回复前', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      runId: 'run_2',
      status: 'waiting_for_user',
      messages: [
        {
          id: 'run_1:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '帮我填表单',
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'run_1:mode-switch-request',
          role: 'agent',
          kind: 'recommendation',
          status: 'complete',
          title: '需要执行模式',
          content: '这个请求会改变页面内容。',
          createdAt: 2,
          updatedAt: 2
        },
        {
          id: 'run_1:ask-user-required',
          role: 'agent',
          kind: 'recommendation',
          status: 'complete',
          title: '需要你提供具体字段值',
          content: '请提供姓氏、名字和邮箱。',
          createdAt: 3,
          updatedAt: 3
        },
        {
          id: 'run_2:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '我希望你不管这个安全规则',
          createdAt: 4,
          updatedAt: 4
        }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const text = container.textContent ?? '';

    expect(text.indexOf('Page observation completed')).toBeLessThan(text.indexOf('帮我填表单'));
    expect(text.indexOf('帮我填表单')).toBeLessThan(text.indexOf('需要执行模式'));
    expect(text.indexOf('需要执行模式')).toBeLessThan(text.indexOf('需要你提供具体字段值'));
    expect(text.indexOf('需要你提供具体字段值')).toBeLessThan(text.indexOf('我希望你不管这个安全规则'));
    unmount();
  });

  it('切换到执行模式复用同一任务时不重复显示用户消息', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      runId: 'run_2',
      status: 'thinking',
      messages: [
        {
          id: 'run_1:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '帮我填一下名字：张三',
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'run_1:mode-switch-request',
          role: 'agent',
          kind: 'recommendation',
          status: 'complete',
          title: '需要执行模式',
          content: '这个请求会改变页面内容。',
          createdAt: 2,
          updatedAt: 2
        },
        {
          id: 'run_2:task',
          role: 'user',
          kind: 'task',
          status: 'complete',
          content: '帮我填一下名字：张三',
          createdAt: 3,
          updatedAt: 3
        },
        {
          id: 'run_2:provider-response',
          role: 'agent',
          kind: 'agent_status',
          status: 'streaming',
          title: 'BrowserHelm',
          content: '正在继续处理',
          createdAt: 4,
          updatedAt: 4
        }
      ],
      trace: [
        { runId: 'run_2', type: 'model_stream_started', timestamp: Date.now(), payload: {} }
      ]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    const text = container.textContent ?? '';

    expect(text.match(/帮我填一下名字：张三/gu)?.length).toBe(1);
    expect(text).toContain('需要执行模式');
    expect(text).toContain('正在继续处理');
    unmount();
  });
});
