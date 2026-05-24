import { expect, type Page } from '@playwright/test';

export class PageObservationPanel {
  constructor(private readonly page: Page) {}

  async expectVisible(expected: { url: string; title: string }): Promise<void> {
    await expect(this.page.getByRole('button', { name: '页面观察' })).toBeVisible();
    await expect(this.page.getByText('当前 URL / 标题')).toBeVisible();
    await expect(this.page.getByRole('heading', { name: /工具结果/ })).toBeVisible();
    await expect(this.page.getByText(expected.title)).toBeVisible();
    await expect(this.page.getByText(expected.url)).toBeVisible();
    await expect(this.page.getByText('bh_page_observe OK')).toBeVisible();
  }

  async expectEmpty(expected: { url: string; title: string }): Promise<void> {
    await this.expectVisible(expected);
    await expect(this.page.locator('.bh-status').getByText('页面为空')).toBeVisible();
    await expect(this.page.getByText('交互元素 0')).toBeVisible();
    await this.page.getByRole('button', { name: 'Ref 映射' }).click();
    await expect(this.page.getByText('当前 observation 没有返回 ref 映射。')).toBeVisible();
  }
}
