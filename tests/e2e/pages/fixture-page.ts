import type { Page } from '@playwright/test';

export class FixturePage {
  constructor(
    readonly page: Page,
    private readonly origin: string
  ) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(`${this.origin}/${path}`);
  }

  async removeElement(selector: string): Promise<void> {
    await this.page.locator(selector).evaluate((element) => element.remove());
  }
}
