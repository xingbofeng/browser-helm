import { expect } from '@playwright/test';

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

    await expect(sidePanelPage.getByText(/forms\s+ready\s+2/u)).toBeVisible({
      timeout: 8_000
    });
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
