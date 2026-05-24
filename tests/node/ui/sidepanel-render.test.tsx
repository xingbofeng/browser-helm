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
          mode: 'form',
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
          structuredPageData: {
            observation: {
              status: 'ready',
              summary: '当前页面为“欢迎注册 - 示例网站”',
              count: 1,
              items: [
                {
                  url: 'http://127.0.0.1:3000/basic-form.html',
                  title: '欢迎注册 - 示例网站',
                  currentDomain: '127.0.0.1',
                  origin: 'http://127.0.0.1:3000',
                  visibleTextSummary: '来自页面的摘要文本',
                  pageStateSummary: '页面包含 1 个可交互元素'
                }
              ],
              updatedAt: '2026-05-24T05:00:00.000Z',
              warnings: []
            },
            refs: {
              status: 'ready',
              summary: '检测到 1 个 ref',
              count: 1,
              items: [
                {
                  refId: 'ref_101',
                  role: 'button',
                  name: '提交',
                  tagName: 'button',
                  visible: true,
                  disabled: false
                }
              ],
              updatedAt: '2026-05-24T05:00:00.000Z',
              warnings: []
            },
            interactive: {
              status: 'ready',
              summary: '从 ref summary 浅层派生 1 个交互元素',
              count: 1,
              items: [
                {
                  refId: 'ref_101',
                  role: 'button',
                  name: '提交',
                  tagName: 'button',
                  visible: true,
                  disabled: false,
                  warnings: []
                }
              ],
              updatedAt: '2026-05-24T05:00:00.000Z',
              warnings: []
            },
            forms: {
              status: 'unsupported',
              summary: 'v0.3 尚未实现完整表单字段读取；该能力归属 v0.32',
              count: 0,
              items: [],
              updatedAt: '2026-05-24T05:00:00.000Z',
              warnings: []
            }
          },
          toolResult: {
            tool: 'bh_page_observe',
            ok: true,
            code: 'OK',
            summary: 'Observed 127.0.0.1'
          }
        }}
        onTaskChange={() => undefined}
        mode="form"
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(html).toContain('BrowserHelm');
    expect(html).toContain('页面观察');
    expect(html).toContain('Ref 映射');
    expect(html).toContain('http://127.0.0.1:3000/basic-form.html');
    expect(html).toContain('欢迎注册 - 示例网站');
    expect(html).toContain('来自页面的摘要文本');
    expect(html).toContain('Structured Page Data');
    expect(html).toContain('forms');
    expect(html).toContain('unsupported');
    expect(html).toContain('Observed 127.0.0.1');
    expect(html).toContain('Trace / 调试日志');
    expect(html).toContain('询问 / Ask');
    expect(html).toContain('调试 / Debug');
    expect(html).toContain('表单 / Form');
    expect(html).toContain('动作准备 / Act');
    expect(html).toContain('当前模式');
    expect(html).toContain('<select');
    expect(html).toContain('<option');
    expect(html).toContain('aria-label="选择 Run Mode"');
    expect(html).not.toContain('aria-pressed="true">Form');
    expect(html).toContain('form');
    expect(html).not.toContain('https://demo.example.com/register');
  });

  it('renders structured empty and error states from runtime snapshot data', () => {
    const emptyHtml = renderToString(
      <SidePanelView
        task="观察页面"
        snapshot={{
          runId: 'run_1',
          mode: 'ask',
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
        mode="ask"
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );
    const errorHtml = renderToString(
      <SidePanelView
        task="观察页面"
        snapshot={{
          runId: 'run_2',
          mode: 'ask',
          status: 'error',
          error: {
            code: 'CONTENT_SCRIPT_UNAVAILABLE',
            message: 'Cannot access this page'
          },
          refs: []
        }}
        onTaskChange={() => undefined}
        mode="ask"
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(emptyHtml).toContain('当前页面没有识别到可交互元素');
    expect(errorHtml).toContain('CONTENT_SCRIPT_UNAVAILABLE');
    expect(errorHtml).toContain('Cannot access this page');
  });

  it('renders v0.31 interactive element tab data with list and selected details', () => {
    const html = renderToString(
      <SidePanelView
        task="观察页面"
        mode="debug"
        initialTab="interactive"
        snapshot={snapshotWithInteractiveAndForms()}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(html).toContain('交互元素数量');
    expect(html).toContain('ref_switch');
    expect(html).toContain('启用同步');
    expect(html).toContain('checked=true');
    expect(html).toContain('基础详情');
  });

  it('renders v0.32 form field tab data with submit diagnostics and Chinese confidence labels', () => {
    const html = renderToString(
      <SidePanelView
        task="观察页面"
        mode="form"
        initialTab="forms"
        snapshot={snapshotWithInteractiveAndForms()}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(html).toContain('字段数量');
    expect(html).toContain('必填');
    expect(html).toContain('校验错误');
    expect(html).toContain('submit disabled');
    expect(html).toContain('邮箱');
    expect(html).toContain('valuePreview');
    expect(html).toContain('推断');
  });

  it('renders act mode and minimal approval/readiness status copy', () => {
    const waitingHtml = renderToString(
      <SidePanelView
        task="点击 iframe 按钮"
        mode="act"
        snapshot={{
          runId: 'run_act',
          mode: 'act',
          status: 'waiting_for_approval',
          refs: [],
          toolResult: {
            tool: 'bh_iframe_click',
            ok: false,
            code: 'APPROVAL_REQUIRED',
            summary: 'Requires approval before execution',
            requiresApproval: true
          }
        }}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );
    const deniedHtml = renderToString(
      <SidePanelView
        task="点击 iframe 按钮"
        mode="act"
        snapshot={{
          runId: 'run_act',
          mode: 'act',
          status: 'error',
          refs: [],
          toolResult: {
            tool: 'bh_iframe_click',
            ok: false,
            code: 'USER_DENIED_APPROVAL',
            summary: 'User declined checkout submit',
            changedPage: false,
            requiresObserve: false
          }
        }}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );
    const requiresObserveHtml = renderToString(
      <SidePanelView
        task="检查动作准备"
        mode="act"
        snapshot={{
          runId: 'run_act',
          mode: 'act',
          status: 'observed',
          refs: [],
          toolResult: {
            tool: 'bh_action_check_readiness',
            ok: false,
            code: 'REF_STALE',
            summary: 'Action target needs a fresh observation',
            changedPage: false,
            requiresObserve: true
          }
        }}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStartRun={() => undefined}
      />
    );

    expect(waitingHtml).toContain('动作准备 / Act');
    expect(waitingHtml).toContain('等待用户审批');
    expect(waitingHtml).toContain('需要用户确认后再继续');
    expect(deniedHtml).toContain('用户拒绝了审批');
    expect(deniedHtml).toContain('页面未被修改');
    expect(requiresObserveHtml).toContain('需要重新观察页面');
  });
});

function snapshotWithInteractiveAndForms() {
  return {
    runId: 'run_structured',
    mode: 'form' as const,
    status: 'observed' as const,
    refs: [],
    structuredPageData: {
      observation: {
        status: 'ready' as const,
        summary: '当前页面为“表单页”',
        count: 1,
        items: [
          {
            url: 'https://demo.example.com/form',
            title: '表单页',
            currentDomain: 'demo.example.com',
            origin: 'https://demo.example.com',
            visibleTextSummary: '表单',
            pageStateSummary: '页面包含表单'
          }
        ],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      refs: {
        status: 'ready' as const,
        summary: '检测到 0 个 ref',
        count: 0,
        items: [],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      interactive: {
        status: 'ready' as const,
        summary: '检测到 1 个交互元素',
        count: 1,
        items: [
          {
            refId: 'ref_switch',
            role: 'switch',
            name: '启用同步',
            tagName: 'div',
            visible: true,
            disabled: false,
            checked: true,
            domOrder: 0,
            warnings: []
          }
        ],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      forms: {
        status: 'ready' as const,
        summary: '检测到 1 个字段，必填 1 个，校验错误 1 个，submit disabled',
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
            validation: {
              valid: false,
              message: '请填写邮箱',
              ariaInvalid: true
            },
            submit: {
              refId: 'ref_submit',
              disabled: true,
              reason: {
                kind: 'inferred' as const,
                message: '必填字段为空',
                fieldRefId: 'ref_email'
              }
            },
            warnings: []
          }
        ],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      }
    }
  };
}
