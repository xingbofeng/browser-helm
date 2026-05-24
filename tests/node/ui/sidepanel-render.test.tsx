import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SidePanelView } from '../../../src/entrypoints/sidepanel/app';

describe('side panel MVP', () => {
  it('renders page observation and ref mapping from runtime snapshot data', () => {
    const html = renderToString(
      <SidePanelView
        task="观察页面"
        snapshot={{
          runId: 'run_1',
          status: 'observed',
          observation: {
            url: 'http://127.0.0.1:3000/basic-form.html',
            title: '欢迎注册 - 示例网站',
            currentDomain: '127.0.0.1',
            origin: 'http://127.0.0.1:3000',
            visibleTextSummary: '来自页面的摘要文本',
            pageStateSummary: '页面包含 1 个可交互元素',
            interactiveCount: 1,
            warnings: []
          },
          refs: [
            {
              refId: 'ref_101',
              role: 'button',
              name: '提交',
              tagName: 'button',
              visible: true,
              disabled: false
            }
          ],
          toolResult: {
            tool: 'bh_page_observe',
            ok: true,
            code: 'OK',
            summary: 'Observed 127.0.0.1'
          }
        }}
        onTaskChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(html).toContain('BrowserHelm');
    expect(html).toContain('页面观察');
    expect(html).toContain('Ref 映射');
    expect(html).toContain('http://127.0.0.1:3000/basic-form.html');
    expect(html).toContain('欢迎注册 - 示例网站');
    expect(html).toContain('来自页面的摘要文本');
    expect(html).toContain('Observed 127.0.0.1');
    expect(html).toContain('Trace / 调试日志');
    expect(html).not.toContain('https://demo.example.com/register');
  });

  it('renders structured empty and error states from runtime snapshot data', () => {
    const emptyHtml = renderToString(
      <SidePanelView
        task="观察页面"
        snapshot={{
          runId: 'run_1',
          status: 'empty',
          observation: {
            url: 'http://127.0.0.1:3000/empty.html',
            title: '空页面',
            currentDomain: '127.0.0.1',
            origin: 'http://127.0.0.1:3000',
            visibleTextSummary: '',
            pageStateSummary: '当前页面没有识别到可交互元素',
            interactiveCount: 0,
            warnings: []
          },
          refs: [],
          toolResult: {
            tool: 'bh_page_observe',
            ok: true,
            code: 'OK',
            summary: 'Observed 127.0.0.1'
          }
        }}
        onTaskChange={() => undefined}
        onStartRun={() => undefined}
      />
    );
    const errorHtml = renderToString(
      <SidePanelView
        task="观察页面"
        snapshot={{
          runId: 'run_2',
          status: 'error',
          error: {
            code: 'CONTENT_SCRIPT_UNAVAILABLE',
            message: 'Cannot access this page'
          },
          refs: []
        }}
        onTaskChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(emptyHtml).toContain('当前页面没有识别到可交互元素');
    expect(errorHtml).toContain('CONTENT_SCRIPT_UNAVAILABLE');
    expect(errorHtml).toContain('Cannot access this page');
  });
});
