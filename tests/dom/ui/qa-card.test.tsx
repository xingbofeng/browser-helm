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

  it('running 进度卡在 agent 运行期间显示', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'thinking',
      trace: [{ runId: 'test-run', type: 'model_stream_started', timestamp: Date.now(), payload: {} }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.querySelector('.bh-runProgressCard')).toBeTruthy();
    expect(container.textContent).toContain('Model thinking');
    unmount();
  });

  it('executing_tool 时进度卡显示具体工具动作', () => {
    const snapshot: RunSnapshot = {
      ...mkObsSnapshot(),
      status: 'executing_tool',
      trace: [{ runId: 'test-run', type: 'tool_started', payload: { tool: 'bh_page_read_article' }, timestamp: Date.now() }]
    } as unknown as RunSnapshot;
    const { container, unmount } = render(snapshot);
    expect(container.textContent).toContain('Reading page article');
    expect(container.querySelector('.bh-runProgressCard time')).toBeTruthy();
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

  it('页面观察卡固定显示在任务后、回答前', () => {
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

    expect(text.indexOf('总结下这个页面')).toBeLessThan(text.indexOf('Page observation completed'));
    expect(text.indexOf('Page observation completed')).toBeLessThan(text.indexOf('这是最终回答。'));
    unmount();
  });
});
