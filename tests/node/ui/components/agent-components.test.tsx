// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdvancedDebugDrawer } from '../../../../src/ui/components/advanced-debug-drawer';
import { AgentMessageList } from '../../../../src/ui/components/agent-message-list';
import { ChatPanel } from '../../../../src/ui/components/chat-panel';
import { ModelConfigForm } from '../../../../src/ui/components/model-config-modal';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import { I18nProvider } from '../../../../src/i18n/context';
import type { StructuredPageData } from '../../../../src/shared/schemas/structured-page-data.schema';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('agent side panel components', () => {
  it('exposes ask, act, and full modes in the primary composer', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <ChatPanel
              task=""
              mode="ask"
              busy={false}
              canStop={false}
              onTaskChange={() => undefined}
              onModeChange={() => undefined}
              onStart={() => undefined}
              onStop={() => undefined}
            />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      const picker = container.querySelector<HTMLButtonElement>('button[aria-label="选择 Run Mode"]');
      expect(picker).not.toBeNull();
      await act(async () => {
        picker?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });

      const options = [...container.querySelectorAll('[role="option"]')]
        .map((option) => option.textContent ?? '');
      expect(options).toEqual(['询问 / Ask', '执行 / Act', '完整 / Full']);
      expect(container.textContent).not.toContain('表单 / Form');
      expect(container.textContent).not.toContain('调试 / Debug');
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it('derives page summaries even when runtime messages only contain user-authored messages', () => {
    const html = renderToString(
      <I18nProvider>
        <AgentMessageList
          snapshot={{
            runId: 'run_1',
            mode: 'ask',
            status: 'observed',
            messages: [
              {
                id: 'run_1:task',
                role: 'user',
                kind: 'task',
                status: 'complete',
                content: '检查这个页面',
                createdAt: 1,
                updatedAt: 1
              }
            ],
            structuredPageData: structuredData()
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('检查这个页面');
    expect(html).toContain('注册页');
    expect(html).toContain('example.com');
    expect(html).toContain('页面包含表单');
    expect(html).not.toContain('邮箱 密码');
    expect(html).not.toContain('ref_submit');
  });

  it('derives an initial page summary when runtime messages are absent', () => {
    const html = renderToString(
      <I18nProvider>
        <AgentMessageList
          snapshot={{
            runId: 'run_1',
            mode: 'ask',
            status: 'observed',
            structuredPageData: structuredData()
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('注册页');
    expect(html).toContain('example.com');
    expect(html).toContain('页面包含表单');
    expect(html).not.toContain('ref_submit');
  });

  it('renders diagnosis evidence and confidence without exposing raw ref ids', () => {
    const html = renderToString(
      <I18nProvider>
        <AgentMessageList
          snapshot={{
            runId: 'run_report',
            mode: 'form',
            status: 'finished',
            refs: [],
            debugReport: {
              title: '表单诊断',
              findings: [
                {
                  title: '提交按钮不可用',
                  explanation: '页面提交按钮处于禁用状态，需要先补齐必填字段。',
                  confidence: 'high',
                  evidence: [
                    {
                      source: 'form',
                      summary: '邮箱字段缺少必填值',
                      refId: 'ref_email'
                    }
                  ]
                }
              ],
              recommendations: ['补齐邮箱后再提交'],
              limitations: ['只能读取页面状态，不能自动提交']
            }
          }}
        />
      </I18nProvider>
    );

    expect(html).toContain('提交按钮不可用');
    expect(html).toContain('高信心');
    expect(html).toContain('邮箱字段缺少必填值');
    expect(html).toContain('只能读取页面状态');
    expect(html).not.toContain('ref_email');
  });

  it('sanitizes untrusted agent markdown before rendering HTML', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider>
          <AgentMessageList
            snapshot={{
              runId: 'run_xss',
              mode: 'ask',
              status: 'observed',
              messages: [
                {
                  id: 'run_xss:provider-response',
                  role: 'agent',
                  kind: 'agent_status',
                  status: 'complete',
                  title: 'BrowserHelm',
                  content: '安全 **加粗** <img src=x onerror="window.__xss=1"> [bad](javascript:alert(1)) [ok](https://example.com)',
                  createdAt: 1,
                  updatedAt: 1
                }
              ]
            }}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelector('.bh-markdownContent strong')?.textContent).toBe('加粗');
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['bad', 'ok']);
    expect(links[0]?.hasAttribute('href')).toBe(false);
    expect(links[1]?.getAttribute('href')).toBe('https://example.com');
    root.unmount();
    container.remove();
  });

  it('keeps scrolling while a streaming message grows in place', async () => {
    const scrollValues: number[] = [];
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollTop'
    );
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight'
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 320
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => scrollValues.at(-1) ?? 0,
      set: (value: number) => {
        scrollValues.push(Number(value));
      }
    });

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <AgentMessageList snapshot={snapshotWithStreamingMessage('hello', 1)} />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      await act(async () => {
        root.render(
          <I18nProvider>
            <AgentMessageList
              snapshot={snapshotWithStreamingMessage('hello world with more text', 2)}
            />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      expect(scrollValues.length).toBeGreaterThanOrEqual(2);
      expect(scrollValues.at(-1)).toBe(320);
    } finally {
      root.unmount();
      container.remove();
      restoreDescriptor(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      restoreDescriptor(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
    }
  });

  it('keeps Debug collapsed, then renders merged elements/forms only after opening', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const snapshot: RunSnapshot = {
      runId: 'run_debug',
      mode: 'debug',
      status: 'observed',
      trace: [
        { runId: 'run_debug', type: 'model_stream_started', payload: { model: 'gpt-test' } }
      ],
      streaming: {
        enabled: true,
        active: false,
        chunkCount: 3,
        fallbackUsed: false
      },
      capabilityLimitations: ['CDP deep inspection unavailable']
    };

    await act(async () => {
      root.render(<I18nProvider><AdvancedDebugDrawer snapshot={snapshot} structuredPageData={structuredData()} /></I18nProvider>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('高级开发者选项');
    expect(container.textContent).not.toContain('ref_submit');

    await act(async () => {
      button('高级开发者选项').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('元素与表单').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('ref_submit');
    expect(container.textContent).toContain('邮箱');
    expect(container.textContent).toContain('浅层 Debug / CDP 不可用');
    root.unmount();
    container.remove();
  });

  it('saves model configuration and tests provider connection without leaking the key', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSave = vi.fn(() => Promise.resolve());
    const onTest = vi.fn(() => Promise.resolve({
      ok: true,
      code: 'OK',
      message: '连接正常',
      supportsStreaming: true,
      model: 'gpt-test'
    }));

    await act(async () => {
      root.render(
        <I18nProvider>
          <ModelConfigForm
            settings={{
              baseUrl: 'https://api.example.com/v1',
              model: 'gpt-old',
              apiKey: 'sk-existing-secret',
              streamingEnabled: true
            }}
            maskedApiKey="sk-...cret"
            onClose={() => undefined}
            onSave={onSave}
            onTest={onTest}
          />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    expect([...document.querySelectorAll('.bh-modelConfig label > span')]
      .map((element) => element.textContent?.trim())
      .filter(Boolean)).toEqual(['Base URL', 'Model', 'API Key']);

    await act(async () => {
      changeInput('Base URL', 'https://api.next.example/v1');
      changeInput('Model', 'gpt-test');
      changeInput('API Key', 'sk-new-secret');
      button('测试连接').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const testSettings = (onTest.mock.calls as unknown as Array<[unknown]>)[0]?.[0];
    expect(testSettings).toMatchObject({
      baseUrl: 'https://api.next.example/v1',
      model: 'gpt-test',
      apiKey: 'sk-new-secret',
      streamingEnabled: true
    });
    expect(document.body.textContent).toContain('连接正常');
    expect(document.body.textContent).not.toContain('sk-new-secret');

    await act(async () => {
      button('保存配置').click();
      await Promise.resolve();
    });

    const savedSettings = (onSave.mock.calls as unknown as Array<[unknown]>)[0]?.[0];
    expect(savedSettings).toMatchObject({
      apiKey: 'sk-new-secret',
      streamingEnabled: true
    });
    root.unmount();
    container.remove();
  });

  it('warns and saves explicit consent for local provider endpoints', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSave = vi.fn(() => Promise.resolve());
    const onTest = vi.fn(() => Promise.resolve({
      ok: true,
      code: 'OK',
      message: '连接正常',
      supportsStreaming: false,
      model: 'local-model'
    }));

    await act(async () => {
      root.render(
        <I18nProvider>
          <ModelConfigForm
            settings={{
              baseUrl: 'http://127.0.0.1:8787/v1',
              model: 'local-model',
              apiKey: 'sk-local',
              streamingEnabled: false,
              allowLocalProviderEndpoints: true
            }}
            onClose={() => undefined}
            onSave={onSave}
            onTest={onTest}
          />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('本地配置');

    await act(async () => {
      button('保存配置').click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:8787/v1',
      allowLocalProviderEndpoints: true
    }));
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

function snapshotWithStreamingMessage(content: string, updatedAt: number): RunSnapshot {
  return {
    runId: 'run_stream_scroll',
    mode: 'ask',
    status: 'thinking',
    messages: [
      {
        id: 'run_stream_scroll:provider-response',
        role: 'agent',
        kind: 'agent_status',
        status: 'streaming',
        title: 'BrowserHelm',
        content,
        createdAt: 1,
        updatedAt
      }
    ]
  };
}

function restoreDescriptor(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }
  delete (target as Record<string, unknown>)[property];
}

function structuredData(): StructuredPageData {
  return {
    observation: {
      status: 'ready',
      summary: '当前页面为注册页',
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
      status: 'ready',
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
      status: 'ready',
      summary: '检测到按钮',
      count: 1,
      items: [
        {
          refId: 'ref_submit',
          role: 'button',
          name: '提交',
          tagName: 'button',
          visible: true,
          disabled: false,
          warnings: []
        }
      ],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    },
    forms: {
      status: 'ready',
      summary: '检测到 1 个字段',
      count: 1,
      items: [
        {
          refId: 'ref_email',
          label: '邮箱',
          name: 'email',
          type: 'email',
          required: true,
          disabled: false,
          sensitive: false,
          valuePreview: '',
          validation: { valid: false, message: '请输入有效邮箱' },
          warnings: []
        }
      ],
      updatedAt: '2026-05-25T00:00:00.000Z',
      warnings: []
    }
  };
}
