import { expect, type Page } from '@playwright/test';

export class ErrorStatePanel {
  constructor(private readonly page: Page) {}

  async expectStructuredError(code: string): Promise<void> {
    await this.page.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u }).click();
    await expect(this.page.getByText(/Trace/u).first()).toBeVisible();
    await this.page.getByRole('button', { name: /Trace/u }).click();
    await expect(this.page.locator('.bh-traceLog')).toContainText(code);
  }
}
