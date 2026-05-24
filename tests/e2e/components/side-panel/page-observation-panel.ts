import { expect, type Page } from '@playwright/test';

export class PageObservationPanel {
  constructor(private readonly page: Page) {}

  async expectVisible(expected: { url: string; title: string }): Promise<void> {
    await expect(this.page.getByRole('button', { name: '页面观察' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: '工具结果' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: expected.title })).toBeVisible();
    await expect(this.page.getByText(expected.url)).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'bh_page_observe' })).toBeVisible();
    await expect(this.page.locator('.bh-toolCode').getByText('OK')).toBeVisible();
  }

  async expectEmpty(expected: { url: string; title: string }): Promise<void> {
    await this.expectVisible(expected);
    await expect(this.page.getByText(/empty/u).first()).toBeVisible();
    await this.page.getByRole('button', { name: 'Ref 映射' }).click();
    await expect(this.page.getByText(/未检测到 ref|等待 Ref 映射|检测到 0 个 ref/u)).toBeVisible();
  }
}
