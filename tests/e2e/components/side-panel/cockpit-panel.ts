import { expect, type Page } from '@playwright/test';

export class CockpitPanel {
  constructor(private readonly page: Page) {}

  async expectShell(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /BrowserHelm/u })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '页面观察' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Ref 映射' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '交互元素' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '表单字段' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: '执行时间线' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: '工具结果' })).toBeVisible();
    await expect(this.page.getByText('Settings')).toBeVisible();
  }

  async expectObservedPage(expected: { title: string; url: string }): Promise<void> {
    await expect(this.page.getByRole('heading', { name: expected.title })).toBeVisible();
    await expect(this.page.getByText(expected.url)).toBeVisible();
  }

  async expectObservationTimelineSteps(): Promise<void> {
    const timeline = this.page.locator('.bh-stepTimeline');
    await expect(timeline.getByText('Run 开始')).toBeVisible();
    await expect(timeline.getByText('工具开始')).toBeVisible();
    await expect(timeline.getByText('工具结果')).toBeVisible();
  }

  async stopRun(): Promise<void> {
    await this.page.getByRole('button', { name: '停止任务' }).click();
  }

  async expectCancelled(): Promise<void> {
    await expect(this.page.getByText('已取消')).toBeVisible();
  }

  async expectApprovalDrawer(expected: { action: string; code?: string }): Promise<void> {
    await expect(this.page.getByLabel('Approval')).toBeVisible();
    await expect(this.page.getByLabel('Approval').getByText(expected.action).first()).toBeVisible();
    if (expected.code) {
      await expect(this.page.locator('p').filter({ hasText: expected.code }).first()).toBeVisible();
    }
  }

  async expectSettingsMasking(expected: { baseUrl: string; model: string }): Promise<void> {
    await this.openSettings();
    await expect(this.page.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
      expected.baseUrl
    );
    await expect(this.page.getByRole('textbox', { name: 'Model' })).toHaveValue(
      expected.model
    );
    await expect(this.page.getByText('sk-...cret')).toBeVisible();
    await expect(this.page.getByText('sk-e2e-secret')).toHaveCount(0);
  }

  async saveProviderSettings(settings: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<void> {
    await this.openSettings();
    await this.page.getByRole('textbox', { name: 'Base URL' }).fill(settings.baseUrl);
    await this.page.getByRole('textbox', { name: 'Model' }).fill(settings.model);
    if (settings.apiKey) {
      await this.page.getByRole('textbox', { name: 'API Key' }).fill(settings.apiKey);
    }
    await this.page.getByRole('button', { name: 'Save' }).click();
  }

  private async openSettings(): Promise<void> {
    const baseUrl = this.page.getByRole('textbox', { name: 'Base URL' });
    if (await baseUrl.isVisible()) {
      return;
    }
    await this.page.getByText('Settings').click();
    await expect(baseUrl).toBeVisible();
  }
}
