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

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
