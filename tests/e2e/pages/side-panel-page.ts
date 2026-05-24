import type { BrowserContext, Page } from '@playwright/test';

export class SidePanelPage {
  private page: Page | undefined;

  constructor(
    private readonly context: BrowserContext,
    private readonly extensionId: string
  ) {}

  async open(tabId?: number): Promise<Page> {
    this.page = await this.context.newPage();
    const tabParam = tabId ? `?tabId=${tabId}` : '';
    await this.page.goto(`chrome-extension://${this.extensionId}/sidepanel.html${tabParam}`);
    return this.page;
  }

  get pageObject(): Page {
    if (!this.page) {
      throw new Error('Side panel page is not open');
    }
    return this.page;
  }
}
