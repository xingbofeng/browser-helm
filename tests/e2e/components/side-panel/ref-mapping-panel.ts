import { expect, type Page } from '@playwright/test';

export class RefMappingPanel {
  constructor(private readonly page: Page) {}

  async expectVisible(expectedRefId = 'ref_101'): Promise<void> {
    await this.page.getByRole('button', { name: 'Ref 映射' }).click();
    await expect(this.page.getByText(expectedRefId).first()).toBeVisible();
  }

  async expectCanReturnToPageObservation(): Promise<void> {
    await this.page.getByRole('button', { name: '页面观察' }).click();
    await expect(this.page.getByRole('button', { name: '页面观察' })).toBeVisible();
  }
}
