// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdvancedDebugDrawer } from '../../../../src/ui/components/advanced-debug-drawer';
import { AgentMessageList } from '../../../../src/ui/components/agent-message-list';
import { ChatPanel } from '../../../../src/ui/components/chat-panel';
import { FormActionCard } from '../../../../src/ui/components/form-action-card';
import { ModelConfigForm } from '../../../../src/ui/components/model-config-modal';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import { I18nProvider } from '../../../../src/i18n/context';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
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
      await unmountRoot(root);
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

  it('renders v1.1 page acceptance state signals in the page summary', () => {
    expect(renderPageSummary(structuredDataWithoutForms())).toContain('未检测到表单');
    expect(renderPageSummary(structuredDataWithValidForm())).toContain('表单可提交');
    expect(renderPageSummary(structuredData())).toContain('校验异常 1');
    expect(renderPageSummary(structuredDataWithDisabledSubmit())).toContain('提交禁用');

    const healthHtml = renderPageSummary(structuredDataWithoutForms(), {
      toolResult: {
        tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
        ok: true,
        code: ERROR_CODES.OK,
        summary: '检测到页面错误',
        detail: {
          data: {
            consoleErrors: [{ message: 'boom', count: 1 }],
            consoleMessages: [],
            networkFailures: [{ url: 'https://api.example.com/[REDACTED_PATH]', method: 'GET', errorText: 'Failed' }],
            hasForm: false,
            pageStateSummary: '检测到页面错误'
          }
        }
      }
    });

    expect(healthHtml).toContain('Console error 1');
    expect(healthHtml).toContain('Network failure 1');
  });

  it('renders submit approval required, denied, and stale states distinctly', () => {
    const approvalRequired = renderToString(
      <I18nProvider>
        <FormActionCard
          toolResult={{
            tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
            ok: false,
            code: ERROR_CODES.APPROVAL_REQUIRED,
            summary: 'Submit requires approval',
            requiresApproval: true
          }}
        />
      </I18nProvider>
    );
    expect(approvalRequired).toContain('提交需要确认');

    const denied = renderToString(
      <I18nProvider>
        <FormActionCard
          toolResult={{
            tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
            ok: false,
            code: ERROR_CODES.USER_DENIED_APPROVAL,
            summary: 'Denied'
          }}
          snapshot={{
            runId: 'run_denied',
            mode: 'form',
            status: 'failed',
            pendingApproval: {
              id: 'approval_1',
              runId: 'run_denied',
              stepId: 'step_1',
              tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
              argsPreview: {},
              risk: 'high',
              reason: 'Confirm submit',
              status: 'denied',
              createdAt: 1,
              decidedAt: 2
            }
          }}
        />
      </I18nProvider>
    );
    expect(denied).toContain('提交已拒绝');

    const stale = renderToString(
      <I18nProvider>
        <FormActionCard
          toolResult={{
            tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
            ok: false,
            code: ERROR_CODES.APPROVAL_CONTEXT_STALE,
            summary: 'Approval context changed'
          }}
        />
      </I18nProvider>
    );
    expect(stale).toContain('提交上下文已变化');
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

  it('sanitizes untrusted agent markdown before rendering HTML', async () => {
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
    await unmountRoot(root);
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
      await unmountRoot(root);
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
      openDebugDrawer(container);
      await Promise.resolve();
    });
    await act(async () => {
      button('元素与表单', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('ref_submit');
    expect(container.textContent).toContain('邮箱');
    expect(container.textContent).toContain('浅层 Debug / CDP 不可用');
    await unmountRoot(root);
    container.remove();
  });

  it('renders vision observations from the debug drawer Vision tab', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const snapshot: RunSnapshot = {
      runId: 'run_vision',
      mode: 'debug',
      status: 'finished',
      toolResult: {
        tool: 'bh_vision_describe_viewport',
        ok: true,
        code: 'OK',
        summary: 'Vision observation: 按钮被浮层遮挡',
        detail: {
          data: {
            screenshot: {
              mode: 'viewport',
              mimeType: 'image/png',
              width: 1280,
              height: 720
            },
            observation: {
              summary: '按钮被浮层遮挡',
              blockers: ['cookie banner overlaps button'],
              layoutIssues: ['primary CTA shifted below fold'],
              fallback: 'none',
              confidence: 0.88
            }
          }
        }
      }
    };

    await act(async () => {
      root.render(<I18nProvider><AdvancedDebugDrawer snapshot={snapshot} structuredPageData={structuredData()} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      openDebugDrawer(container);
      await Promise.resolve();
    });
    await act(async () => {
      button('视觉检查', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('按钮被浮层遮挡');
    expect(container.textContent).toContain('cookie banner overlaps button');
    expect(container.textContent).toContain('1280 x 720');
    await unmountRoot(root);
    container.remove();
  });

  it('renders CDP product states without leaking sensitive request data', async () => {
    expect(await renderDeepInspectText({ runId: 'run_cdp_detached', mode: 'debug', status: 'observed' }))
      .toContain('Debugger 未连接，请先连接后再收集请求详情。');

    expect(await renderDeepInspectText({
      runId: 'run_cdp_attaching',
      mode: 'debug',
      status: 'executing_tool',
      trace: [
        {
          runId: 'run_cdp_attaching',
          type: TRACE_EVENT_NAMES.TOOL_STARTED,
          payload: { tool: TOOL_NAMES.CDP_ATTACH, argsPreview: {} }
        }
      ]
    })).toContain('Debugger 正在连接，请稍候。');

    expect(await renderDeepInspectText({
      runId: 'run_cdp_failed',
      mode: 'debug',
      status: 'failed',
      toolResult: {
        tool: TOOL_NAMES.CDP_ATTACH,
        ok: false,
        code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        summary: 'Debugger attach failed',
        detail: {
          data: {
            state: {
              tabId: 42,
              attached: false,
              protocolVersion: '1.3',
              reason: 'permission denied'
            }
          }
        }
      }
    })).toContain('permission denied');

    const attachedNoRequests = await renderDeepInspectText({
      runId: 'run_cdp_empty',
      mode: 'debug',
      status: 'observed',
      toolResult: {
        tool: TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'Collected 0 network request(s).',
        detail: { data: { tabId: 42, requests: [] } }
      }
    });
    expect(attachedNoRequests).toContain('Debugger 已连接，深度网络检查已启用。');
    expect(attachedNoRequests).toContain('尚未捕获请求，可刷新页面后重试。');

    const selectedRequest = await renderDeepInspectText({
      runId: 'run_cdp_detail',
      mode: 'debug',
      status: 'observed',
      toolResult: {
        tool: TOOL_NAMES.CDP_GET_REQUEST_DETAIL,
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'Request detail loaded.',
        detail: {
          data: {
            detail: {
              requestId: 'req_1',
              url: 'https://api.example.test/[REDACTED_PATH]',
              method: 'POST',
              status: 200,
              failed: false,
              requestHeadersPreview: {
                Authorization: '[REDACTED]',
                Cookie: '[REDACTED]',
                Accept: 'application/json'
              },
              responseHeadersPreview: {
                'Set-Cookie': '[REDACTED]',
                'Content-Type': 'application/json'
              },
              responseBodyAvailable: false,
              responseBodyPreviewAvailable: false,
              responseBodyUnavailableReason: 'sensitive_response_body',
              responseBodyPreview: '[REDACTED]'
            }
          }
        }
      }
    });
    expect(selectedRequest).toContain('POST 200');
    expect(selectedRequest).toContain('req_1');
    expect(selectedRequest).toContain('Authorization');
    expect(selectedRequest).toContain('[REDACTED]');
    expect(selectedRequest).toContain('sensitive_response_body');
    expect(selectedRequest).not.toContain('Bearer secret-token');
    expect(selectedRequest).not.toContain('session=secret-cookie');
    expect(selectedRequest).not.toContain('super-secret-response');

    const externallyDetached = await renderDeepInspectText({
      runId: 'run_cdp_external_detach',
      mode: 'debug',
      status: 'observed',
      toolResult: {
        tool: TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
        ok: false,
        code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        summary: 'Debugger detached externally.',
        detail: {
          data: {
            state: {
              tabId: 42,
              attached: false,
              protocolVersion: '1.3',
              detachReason: 'target closed'
            }
          }
        }
      }
    });
    expect(externallyDetached).toContain('Debugger 已从外部断开：target closed');
  });

  it('renders sanitized screenshot metadata in the Vision tab without requiring raw image data', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const snapshot: RunSnapshot = {
      runId: 'run_vision_capture',
      mode: 'debug',
      status: 'observed',
      toolResult: {
        tool: 'bh_vision_capture_full_page',
        ok: true,
        code: 'OK',
        summary: 'Captured full-page screenshot shot_1.',
        detail: {
          data: {
            screenshot: {
              id: 'shot_1',
              tabId: 42,
              mode: 'full_page',
              mimeType: 'image/png',
              width: 1440,
              height: 2400,
              dataUrl: '[MASKED_IMAGE_DATA]',
              capturedAt: 123,
              traceSafe: false
            },
            observation: {
              summary: '截图已捕获，原始图片未持久化。',
              fallback: 'none'
            }
          }
        }
      }
    };

    await act(async () => {
      root.render(<I18nProvider><AdvancedDebugDrawer snapshot={snapshot} structuredPageData={structuredData()} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      openDebugDrawer(container);
      await Promise.resolve();
    });
    await act(async () => {
      button('视觉检查', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('full_page');
    expect(container.textContent).toContain('1440 x 2400');
    expect(container.innerHTML).not.toContain('data:image');
    await unmountRoot(root);
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

    await act(async () => {
      button('大模型设置', container).click();
      await Promise.resolve();
    });

    expect([...document.querySelectorAll('.bh-modelConfig label > span')]
      .map((element) => element.textContent?.trim())
      .filter(Boolean)).toEqual(['Base URL', 'Model', 'API Key']);

    await act(async () => {
      changeInput('Base URL', 'https://api.next.example/v1');
      changeInput('Model', 'gpt-test');
      changeInput('API Key', 'sk-new-secret');
      button('测试连接', container).click();
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
      button('保存配置', container).click();
      await Promise.resolve();
    });

    const savedSettings = (onSave.mock.calls as unknown as Array<[unknown]>)[0]?.[0];
    expect(savedSettings).toMatchObject({
      apiKey: 'sk-new-secret',
      apiKeyPersistence: 'local',
      streamingEnabled: true
    });
    await unmountRoot(root);
    container.remove();
  });

  it('splits settings into general, model, and shortcut tabs', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nProvider>
          <ModelConfigForm
            settings={{
              baseUrl: 'https://api.example.com/v1',
              model: 'gpt-test',
              apiKeyPersistence: 'local'
            }}
            onClose={() => undefined}
            onSave={() => Promise.resolve()}
            onTest={() => Promise.resolve({
              ok: true,
              code: 'OK',
              message: '连接正常'
            })}
          />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const tabNames = [...container.querySelectorAll('[role="tab"]')]
      .map((tab) => tab.textContent?.trim());
    expect(tabNames).toEqual(['通用设置', '大模型设置', '快捷键设置']);
    expect(container.textContent).toContain('界面语言');
    expect(container.textContent).not.toContain('Base URL');

    await act(async () => {
      button('大模型设置', container).click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Base URL');
    expect(container.textContent).toContain('API Key 存储');
    expect(container.textContent).not.toContain('Alt+Shift+M');

    await act(async () => {
      button('快捷键设置', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('下载选区为 Markdown');
    expect(container.textContent).toContain('Alt+Shift+M');
    expect(container.textContent).toContain('解释选中文字');
    expect(container.textContent).toContain('Alt+Shift+E');
    expect(container.textContent).toContain('翻译选中文字');
    expect(container.textContent).toContain('Alt+Shift+T');
    expect(container.textContent).toContain('截取当前视口');
    expect(container.textContent).toContain('截取当前页面长图');
    expect(container.textContent).toContain('获取当前页面全部图片');
    expect(container.textContent).toContain('未绑定');
    expect(container.textContent).toContain('最多允许扩展预设 4 个快捷键');
    await unmountRoot(root);
    container.remove();
  });

  it('requires explicit local persistence choice before saving provider API keys locally', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSave = vi.fn(() => Promise.resolve());

    await act(async () => {
      root.render(
        <I18nProvider>
          <ModelConfigForm
            settings={{
              baseUrl: 'https://api.example.com/v1',
              model: 'gpt-test',
              apiKey: 'sk-existing-secret',
              apiKeyPersistence: 'local'
            }}
            maskedApiKey="sk-...cret"
            onClose={() => undefined}
            onSave={onSave}
            onTest={() => Promise.resolve({
              ok: true,
              code: 'OK',
              message: '连接正常'
            })}
          />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      button('大模型设置', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('API Key 存储');
    expect(container.textContent).toContain('当前浏览器会话');
    expect(container.textContent).toContain('受信任本地存储');
    expect(container.textContent).toContain('扩展刷新后仍可使用');

    await act(async () => {
      button('保存配置', container).click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      apiKeyPersistence: 'local'
    }));
    await unmountRoot(root);
    container.remove();
  });

  it('warns when session-stored provider API key is no longer available', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nProvider>
          <ModelConfigForm
            settings={{
              baseUrl: 'https://tokenhub.tencentmaas.com/v1/',
              model: 'deepseek-v4-flash-202605',
              apiKeyPersistence: 'session',
              streamingEnabled: true
            }}
            onClose={() => undefined}
            onSave={() => Promise.resolve()}
            onTest={() => Promise.resolve({
              ok: false,
              code: 'PROVIDER_NOT_CONFIGURED',
              message: 'missing key'
            })}
          />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      button('大模型设置', container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('当前只保存了 Base URL/Model，API Key 不在会话存储中');
    await unmountRoot(root);
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
      button('保存配置', container).click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:8787/v1',
      allowLocalProviderEndpoints: true
    }));
    await unmountRoot(root);
    container.remove();
  });
});

function button(name: string, scope: ParentNode = document): HTMLButtonElement {
  const element = [...scope.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.includes(name) ||
      candidate.getAttribute('aria-label') === name
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${name}`);
  }
  return element;
}

function openDebugDrawer(scope: ParentNode): void {
  if ([...scope.querySelectorAll('button')].some((candidate) =>
    candidate.getAttribute('aria-label') === '视觉检查' ||
    candidate.textContent?.includes('元素与表单')
  )) {
    return;
  }
  button('高级开发者选项', scope).click();
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

function renderPageSummary(data: StructuredPageData, snapshot: Partial<RunSnapshot> = {}): string {
  return renderToString(
    <I18nProvider>
      <AgentMessageList
        snapshot={{
          runId: 'run_page_states',
          mode: 'ask',
          status: 'observed',
          structuredPageData: data,
          ...snapshot
        }}
      />
    </I18nProvider>
  );
}

async function renderDeepInspectText(snapshot: RunSnapshot): Promise<string> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let text: string;
  try {
    await act(async () => {
      root.render(<I18nProvider><AdvancedDebugDrawer snapshot={snapshot} structuredPageData={structuredData()} /></I18nProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      openDebugDrawer(container);
      await Promise.resolve();
    });
    await act(async () => {
      button('Deep Inspect', container).click();
      await Promise.resolve();
    });
    text = container.textContent ?? '';
  } finally {
    await unmountRoot(root);
    container.remove();
  }
  return text;
}

async function unmountRoot(root: ReturnType<typeof createRoot>): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
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

function structuredDataWithoutForms(): StructuredPageData {
  const data = structuredData();
  data.forms = {
    ...data.forms,
    summary: '未检测到表单',
    count: 0,
    items: []
  };
  return data;
}

function structuredDataWithValidForm(): StructuredPageData {
  const data = structuredData();
  data.forms = {
    ...data.forms,
    summary: '检测到 1 个可提交字段',
    items: data.forms.items.map((field) => ({
      ...field,
      valuePreview: 'counter@example.com',
      validation: { valid: true }
    }))
  };
  return data;
}

function structuredDataWithDisabledSubmit(): StructuredPageData {
  const data = structuredDataWithValidForm();
  data.forms = {
    ...data.forms,
    items: data.forms.items.map((field) => ({
      ...field,
      submit: {
        refId: 'ref_submit',
        disabled: true,
        reason: {
          kind: 'confirmed',
          message: '缺少同意条款'
        }
      }
    }))
  };
  return data;
}
