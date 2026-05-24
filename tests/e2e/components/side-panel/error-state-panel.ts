import { expect, type Page } from '@playwright/test';

export class ErrorStatePanel {
  constructor(private readonly page: Page) {}

  async expectStructuredError(code: string): Promise<void> {
    await expect(this.page.getByText('Trace / 调试日志')).toBeVisible();
    await expect(this.page.getByText(code, { exact: true })).toBeVisible();
  }
}
