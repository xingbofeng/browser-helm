import { expect } from '@playwright/test';

import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import { PageObservationPanel } from '../components/side-panel/page-observation-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class PageObservationFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<PageObservationFlow> {
    return new PageObservationFlow(await E2EFlowContext.create());
  }

  async expectBasicFormObservation(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const shell = this.flowContext.shell();
    const tabId = await shell.activeTabId();

    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    await new PageObservationPanel(sidePanelPage).expectVisible({
      url: `${this.flowContext.origin}/basic-form.html`,
      title: '欢迎注册 - 示例网站'
    });
  }

  async expectEmptyObservation(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('empty-page.html');

    const shell = this.flowContext.shell();
    const tabId = await shell.activeTabId();

    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    await new PageObservationPanel(sidePanelPage).expectEmpty({
      url: `${this.flowContext.origin}/empty-page.html`,
      title: '纯文本说明 - 示例网站'
    });
  }

  async expectPromptInjectionRemainsObservationData(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('security/prompt-injection.html');

    const shell = this.flowContext.shell();
    await expect.poll(async () => shell.observeActiveTab()).toMatchObject({
      ok: true,
      observation: expect.objectContaining({
        visibleText: expect.stringContaining('ignore previous instructions'),
        origin: this.flowContext.origin
      })
    });
  }

  async expectIframeFormObservation(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const snapshot = await this.flowContext.sidePanel().runOnTab({
      tabId,
      task: '观察 iframe 表单',
      mode: 'form'
    });

    expect(snapshot).toMatchObject({
      status: 'observed',
      structuredPageData: {
        forms: expect.objectContaining({
          status: 'ready',
          count: 3,
          items: expect.arrayContaining([
            expect.objectContaining({
              refId: expect.stringMatching(/^frame_\d+:ref_\d+$/u),
              name: 'email',
              type: 'email',
              required: true
            }),
            expect.objectContaining({
              refId: expect.stringMatching(/^frame_\d+:ref_\d+$/u),
              name: 'country',
              type: 'select',
              required: true
            })
          ])
        })
      },
      refs: expect.arrayContaining([
        expect.objectContaining({
          refId: expect.stringMatching(/^frame_\d+:ref_\d+$/u),
          role: 'textbox'
        }),
        expect.objectContaining({
          refId: expect.stringMatching(/^frame_\d+:ref_\d+$/u),
          role: 'button',
          name: '创建账号'
        })
      ])
    });
  }

  async expectDelayedIframeFormRefresh(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('delayed-iframe-form-host.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);

    await sidePanelPage.getByRole('button', { name: '高级开发者选项' }).click();
    await expect(
      sidePanelPage.locator('.bh-debugSummary').getByText('表单 2')
    ).toBeVisible({ timeout: 8_000 });
  }

  async expectIframeActModeReadClickType(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const shell = this.flowContext.shell();
    const tabId = await shell.activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '动作准备 iframe 读写',
      mode: 'act'
    });
    const emailRef = findFrameRef(snapshot.refs, {
      role: 'textbox',
      name: '邮箱'
    });
    const detailsRef = findFrameRef(snapshot.refs, {
      role: 'button',
      name: '展开详情'
    });
    const read = await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.IFRAME_READ,
      args: {
        refId: `frame_${emailRef.frameId}:${emailRef.innerRefId}`
      }
    });
    expect(read).toMatchObject({
      ok: true,
      data: {
        ref: expect.objectContaining({
          refId: `frame_${emailRef.frameId}:${emailRef.innerRefId}`
        })
      }
    });

    const click = await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
      args: {
        refId: `frame_${detailsRef.frameId}:${detailsRef.innerRefId}`
      }
    });
    expect(click).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    await expect(fixture.page.frameLocator('iframe').locator('body')).not.toHaveAttribute(
      'data-details',
      'open'
    );

    const type = await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.IFRAME_TYPE,
      args: {
        refId: `frame_${emailRef.frameId}:${emailRef.innerRefId}`,
        text: 'hello@example.com',
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'email'
        }
      }
    });
    expect(type).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    await expect(
      fixture.page.frameLocator('iframe').locator('input[name="email"]')
    ).toHaveValue('');
  }

  async expectRuntimeApprovalDenyForIframeTool(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const shell = this.flowContext.shell();
    const tabId = await shell.activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '审批 iframe 高风险按钮',
      mode: 'act'
    });
    const deleteRef = findFrameRef(snapshot.refs, {
      role: 'button',
      name: '删除账号'
    });

    const approvalRequired = await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
      args: {
        refId: `frame_${deleteRef.frameId}:${deleteRef.innerRefId}`
      }
    });
    const waiting = await sidePanel.snapshot(snapshot.runId);
    const denied = await sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: waiting.pendingApproval?.id ?? '',
      decision: 'denied',
      reason: '用户拒绝删除账号'
    });

    expect(approvalRequired).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(waiting).toMatchObject({
      status: 'waiting_for_approval',
      pendingApproval: {
        tool: TOOL_NAMES.IFRAME_CLICK,
        risk: 'high'
      }
    });
    expect(denied).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL,
      changedPage: false
    });
    await expect(fixture.page.frameLocator('iframe').locator('body')).not.toHaveAttribute(
      'data-danger',
      'deleted'
    );
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

export function findFrameRef(
  refs:
    | Array<{
        refId: string;
        role?: string | undefined;
        name?: string | undefined;
      }>
    | undefined,
  query: { role: string; name: string }
): { frameId: number; innerRefId: string } {
  const ref = refs?.find((item) => item.role === query.role && item.name === query.name);
  if (!ref) {
    throw new Error(`Unable to find iframe ref: ${query.role} ${query.name}`);
  }
  const match = /^frame_(\d+):(ref_\d+)$/u.exec(ref.refId);
  if (!match) {
    throw new Error(`Expected composite iframe ref, got ${ref.refId}`);
  }
  return {
    frameId: Number(match[1]),
    innerRefId: match[2]!
  };
}
