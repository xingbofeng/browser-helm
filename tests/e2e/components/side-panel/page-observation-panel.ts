import { expect, type Page } from '@playwright/test';

export class PageObservationPanel {
  constructor(private readonly page: Page) {}

  async expectVisible(expected: { url: string; title: string }): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /BrowserHelm/u })).toBeVisible();
    await expect(this.page.getByLabel('BrowserHelm Agent 消息')).toBeVisible();
    await expect(this.page.getByText(expected.title)).toBeVisible();
    await expect(
      this.page.locator('.bh-pageObservationBody span').getByText(new URL(expected.url).hostname, { exact: true })
    ).toBeVisible();
    await expect(this.page.getByText(expected.url)).toHaveCount(0);
    await this.openDebugTab('工具');
    await expect(this.page.getByRole('heading', { name: 'bh_page_observe' })).toBeVisible();
    await expect(this.page.locator('.bh-toolCode').getByText('OK')).toBeVisible();
  }

  async expectEmpty(expected: { url: string; title: string }): Promise<void> {
    await this.expectVisible(expected);
    await expect(this.page.getByText(/empty/u).first()).toBeVisible();
    await this.openDebugTab('元素与表单');
    await expect(this.page.locator('.bh-elementListItem')).toHaveCount(0);
    await expect(this.page.locator('.bh-debugSummary').getByText('元素 0')).toBeVisible();
  }

  private async openDebugTab(tabName: string): Promise<void> {
    if (!(await this.page.getByRole('button', { name: /Trace/u }).first().isVisible())) {
      await this.page.getByRole('button', { name: '高级开发者选项' }).click();
    }
    await this.page.getByRole('button', { name: tabName }).click();
  }
}
