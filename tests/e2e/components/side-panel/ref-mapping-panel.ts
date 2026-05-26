import { expect, type Page } from '@playwright/test';

export class RefMappingPanel {
  constructor(private readonly page: Page) {}

  async expectVisible(expectedRefId = 'ref_101'): Promise<void> {
    await this.page.getByRole('button', { name: '高级开发者选项' }).click();
    await this.page.getByRole('button', { name: '元素与表单' }).click();
    await expect(this.page.getByText(expectedRefId).first()).toBeVisible();
  }

  async expectCanReturnToPageObservation(): Promise<void> {
    await this.page.getByRole('button', { name: /Trace/u }).click();
    await expect(this.page.getByText('事件摘要')).toBeVisible();
  }
}
