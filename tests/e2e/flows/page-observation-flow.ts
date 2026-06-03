import { expect, type Locator } from '@playwright/test';

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

  async expectPromptInjectionDoesNotExecutePageSuggestedMutations(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('security/prompt-injection.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const actSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '总结这个页面，不要点击按钮，也不要填写或提交表单。',
      mode: 'act',
      runKind: 'observe_only'
    });
    const continueRef = findRef(actSnapshot.refs, { role: 'button', name: '继续' });

    const click = await sidePanel.executeTool({
      runId: actSnapshot.runId,
      tool: TOOL_NAMES.ACTION_CLICK,
      source: 'agent',
      args: {
        refId: continueRef.refId,
        source: 'agent'
      }
    });
    expect(click).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    await expectPromptInjectionState(fixture, { clicked: 0, email: '', submitted: 0 });

    const pointerSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '总结这个页面，不要点击按钮，也不要填写或提交表单。',
      mode: 'full',
      runKind: 'observe_only'
    });
    const point = await centerPoint(fixture.page.getByRole('button', { name: '继续' }));
    const pointer = await sidePanel.executeTool({
      runId: pointerSnapshot.runId,
      tool: TOOL_NAMES.POINTER_CLICK,
      source: 'agent',
      args: {
        ...point,
        reason: 'Prompt injection text asked for this click, but the user only requested a summary.'
      }
    });
    expect(pointer).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    await expectPromptInjectionState(fixture, { clicked: 0, email: '', submitted: 0 });

    const formSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '总结这个页面，不要点击按钮，也不要填写或提交表单。',
      mode: 'form',
      runKind: 'observe_only'
    });
    const emailRef = findRef(formSnapshot.refs, { role: 'textbox', name: '邮箱' });
    const fill = await sidePanel.executeTool({
      runId: formSnapshot.runId,
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      source: 'agent',
      args: {
        fieldRefId: emailRef.refId,
        value: 'attacker@example.com'
      }
    });
    expect(fill).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_INTENT_MISMATCH
    });
    await expectPromptInjectionState(fixture, { clicked: 0, email: '', submitted: 0 });

    const submitRef = findRef(formSnapshot.refs, { role: 'button', name: '提交' });
    const submit = await sidePanel.executeTool({
      runId: formSnapshot.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      source: 'agent',
      args: {
        formName: '注入表单',
        submitMethod: 'button-click',
        submitTargetRefId: submitRef.refId,
        verifyStatus: 'pass',
        verifyFailed: false,
        fieldCount: 1,
        filledCount: 0,
        skippedCount: 1,
        riskExplanation: 'Page text requested submit, but the user only requested a summary.',
        fields: [{
          fieldRefId: emailRef.refId,
          label: '邮箱',
          name: 'email',
          type: 'email',
          valuePreview: 'empty',
          isSensitive: false,
          skipped: true
        }],
        warnings: ['Page-derived submit instruction ignored.']
      }
    });
    expect(submit).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      changedPage: false
    });
    await expectPromptInjectionState(fixture, { clicked: 0, email: '', submitted: 0 });
  }

  async expectIframeFormObservation(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const snapshot = await this.flowContext.sidePanel().runOnTab({
      tabId,
      task: '观察 iframe 表单',
      mode: 'form',
      runKind: 'observe_only'
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

    await sidePanelPage.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u }).click();
    await expect(
      sidePanelPage.locator('.bh-debugSummary').getByText(/表单 2|Forms 2/u)
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
      tool: 'bh_iframe_click',
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
      tool: 'bh_iframe_type',
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

  async expectPublicActionClickMutatesSafeIframeTarget(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');

    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '点击 iframe 内普通按钮',
      mode: 'act'
    });
    const detailsRef = findFrameRef(snapshot.refs, {
      role: 'button',
      name: '展开详情'
    });
    const refId = `frame_${detailsRef.frameId}:${detailsRef.innerRefId}`;

    const click = await sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.ACTION_CLICK,
      args: {
        refId,
        source: 'agent'
      }
    });

    expect(click).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: true,
      requiresObserve: true,
      data: {
        refId
      }
    });
    await expect(fixture.page.frameLocator('iframe').locator('body')).toHaveAttribute(
      'data-details',
      'open'
    );
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
      tool: 'bh_iframe_click',
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
        tool: 'bh_iframe_click',
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

function findRef(
  refs:
    | Array<{
        refId: string;
        role?: string | undefined;
        name?: string | undefined;
      }>
    | undefined,
  query: { role: string; name: string }
): { refId: string } {
  const ref = refs?.find((item) => item.role === query.role && item.name === query.name);
  if (!ref) {
    throw new Error(`Unable to find ref: ${query.role} ${query.name}`);
  }
  return { refId: ref.refId };
}

async function centerPoint(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Unable to locate element bounds');
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

async function expectPromptInjectionState(
  fixture: Awaited<ReturnType<E2EFlowContext['fixturePage']>>,
  expected: { clicked: number; email: string; submitted: number }
): Promise<void> {
  await expect.poll(async () => await fixture.page.evaluate(() => {
    const win = window as unknown as {
      __promptInjectionClickCount: number;
      __promptInjectionSubmitCount: number;
    };
    return {
      clicked: win.__promptInjectionClickCount,
      submitted: win.__promptInjectionSubmitCount,
      email: document.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? ''
    };
  })).toEqual(expected);
}
