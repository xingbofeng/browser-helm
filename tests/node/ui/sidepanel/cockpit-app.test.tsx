// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { FakeRuntimePort } from '../../../../src/runtime/fake-runtime-port';
import type { ExecuteToolInput, RuntimeToolExecutionResult } from '../../../../src/runtime/runtime-messages';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { CockpitApp } from '../../../../src/ui/sidepanel/cockpit-app';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CockpitApp', () => {
  it('renders BrowserHelm agent surface with debug and model configuration entry points', () => {
    const html = renderToString(
      <I18nProvider>
        <CockpitApp
          runtime={new FakeRuntimePort({
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
                  tool: 'bh_form_submit_with_approval',
                  argsPreview: { refId: 'frame_1:ref_1' },
                  risk: 'high',
                  reason: 'Delete account',
                  status: 'pending',
                  createdAt: 1
                },
                trace: [{ runId: 'seed', type: 'approval_required' }]
              }
            ]
          })}
          initialRunId="seed"
        />
      </I18nProvider>
    );

    expect(html).toContain('BrowserHelm');
    expect(html).not.toContain('Cockpit');
    expect(html).not.toContain('页面数据驾驶舱');
    expect(html).toContain('BrowserHelm Agent 消息');
    expect(html).toContain('高级开发者选项');
    expect(html).toContain('aria-label="打开模型配置"');
    expect(html).toContain('你想和 BrowserHelm 聊点什么......');
  });

  it('saves workflow drafts and immediately prepares a replay preview', async () => {
    const runtime = new DraftRuntimePort();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nProvider initialLocale="zh">
          <CockpitApp runtime={runtime} initialRunId="seed" targetTabId={42} />
        </I18nProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Workflow 草稿');
    await act(async () => {
      const saveButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('保存并预览'));
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(runtime.executed.map((input) => input.tool)).toEqual([
      TOOL_NAMES.FLOW_SAVE,
      TOOL_NAMES.FLOW_PREVIEW
    ]);
    expect(runtime.executed[0]?.args).toMatchObject({
      domain: 'app.example.com',
      intent: '打开账单报表'
    });
    expect(runtime.executed[1]?.args).toEqual({ id: 'flow_saved_1' });
    await unmountRoot(root);
    container.remove();
  });

  it('captures the current viewport from the panel header without requiring a typed task', async () => {
    const runtime = new ScreenshotRuntimePort();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nProvider initialLocale="zh">
          <CockpitApp runtime={runtime} initialRunId="seed" />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const captureButton = [...container.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '截取当前视口');
    expect(captureButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      captureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(runtime.executed.map((input) => input.tool)).toEqual([
      TOOL_NAMES.VISION_CAPTURE_VIEWPORT
    ]);
    expect(container.querySelector('img[alt="当前页面视口截图"]')?.getAttribute('src')).toBe('data:image/png;base64,panel');
    expect(container.textContent).toContain('Captured viewport screenshot shot_panel.');
    await unmountRoot(root);
    container.remove();
  });
});

class DraftRuntimePort extends FakeRuntimePort {
  readonly executed: ExecuteToolInput[] = [];

  constructor() {
    super({
      snapshots: [{
        runId: 'seed',
        mode: 'ask',
        status: 'finished',
        refs: [],
        observation: {
          url: 'https://app.example.com/billing',
          title: 'Billing',
          currentDomain: 'app.example.com',
          origin: 'https://app.example.com',
          visibleTextSummary: 'Billing ready',
          pageStateSummary: 'Ready',
          interactiveCount: 1,
          warnings: []
        },
        workflowDraft: {
          id: 'draft_seed',
          domain: 'app.example.com',
          intent: '打开账单报表',
          taskDescription: '打开账单报表',
          steps: [{
            id: 'draft_step_1',
            tool: TOOL_NAMES.PAGE_OBSERVE,
            summary: '观察账单页面',
            risk: 'safe',
            requiresApproval: false
          }],
          completionEvidence: ['页面已确认'],
          requiresPreview: true,
          requiresApproval: true,
          saved: false
        },
        trace: []
      }]
    });
  }

  override async executeTool(input: ExecuteToolInput): Promise<RuntimeToolExecutionResult> {
    this.executed.push(input);
    if (input.tool === TOOL_NAMES.FLOW_SAVE) {
      return {
        ok: true,
        code: 'OK',
        summary: 'Saved workflow',
        data: {
          workflow: {
            id: 'flow_saved_1'
          }
        },
        changedPage: false,
        requiresObserve: false
      };
    }
    return super.executeTool(input);
  }
}

class ScreenshotRuntimePort extends FakeRuntimePort {
  readonly executed: ExecuteToolInput[] = [];

  constructor() {
    super({
      snapshots: [{
        runId: 'seed',
        targetTabId: 42,
        mode: 'ask',
        status: 'observed',
        refs: [],
        trace: []
      }]
    });
  }

  override executeTool(input: ExecuteToolInput): Promise<RuntimeToolExecutionResult> {
    this.executed.push(input);
    return Promise.resolve({
      ok: true,
      code: 'OK',
      summary: 'Captured viewport screenshot shot_panel.',
      data: {
        screenshot: {
          id: 'shot_panel',
          tabId: 42,
          mode: 'viewport',
          mimeType: 'image/png',
          width: 1024,
          height: 768,
          captureSource: 'tabs_capture_visible_tab',
          truncated: false,
          sensitivity: 'unknown',
          dataUrl: 'data:image/png;base64,panel',
          capturedAt: 1,
          traceSafe: false
        }
      },
      changedPage: false,
      requiresObserve: false
    });
  }
}

async function unmountRoot(root: ReturnType<typeof createRoot>): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}
