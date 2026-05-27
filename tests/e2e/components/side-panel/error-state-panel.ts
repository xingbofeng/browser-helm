import { expect, type Page } from '@playwright/test';

export class ErrorStatePanel {
  constructor(private readonly page: Page) {}

  async expectStructuredError(code: string): Promise<void> {
    await this.page.getByRole('button', { name: '高级开发者选项' }).click();
    await expect(this.page.getByText(/Trace/u).first()).toBeVisible();
    await this.page.getByText(/Trace \/ 调试日志/u).click();
    await expect(this.page.locator('.bh-traceLog')).toContainText(code);
  }
}
