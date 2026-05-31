// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { ConsoleEventPanel } from '../../../../src/ui/components/console-event-panel';
import { PerformancePanel } from '../../../../src/ui/components/performance-panel';
import { RequestInspector } from '../../../../src/ui/components/request-inspector';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CDP side panel components', () => {
  it('renders request, performance, and console diagnostics without exposing raw secrets', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <>
            <RequestInspector
              status="attached"
              requests={[{
                requestId: 'req_1',
                url: 'https://api.example.com/orders?token=%5BREDACTED%5D',
                method: 'GET',
                status: 500,
                failed: false,
                requestHeadersPreview: { Authorization: '[MASKED]' },
                responseHeadersPreview: { Cookie: '[MASKED]' },
                responseBodyAvailable: true
              }]}
              detail={{
                requestId: 'req_1',
                url: 'https://api.example.com/orders?token=%5BREDACTED%5D',
                method: 'GET',
                status: 500,
                failed: false,
                requestHeadersPreview: { Authorization: '[MASKED]' },
                responseHeadersPreview: { Cookie: '[MASKED]' },
                responseBodyAvailable: true,
                responseBodyPreview: '{"token":"[MASKED]"}'
              }}
            />
            <PerformancePanel
              snapshot={{
                tabId: 1,
                collectedAt: 1,
                metrics: [{ name: 'Nodes', value: 12 }]
              }}
            />
            <ConsoleEventPanel
              events={[{
                id: 'console_1',
                level: 'error',
                text: 'failed with [MASKED]',
                timestamp: 1
              }]}
            />
          </>
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('请求检查器');
    expect(container.textContent).toContain('Debugger 已连接');
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('Console Events');
    expect(container.textContent).toContain('[MASKED]');
    expect(container.textContent).not.toContain('secret');
    root.unmount();
    container.remove();
  });
});
