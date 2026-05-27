import { expect, type Page } from '@playwright/test';

export class CockpitPanel {
  constructor(private readonly page: Page) {}

  async expectShell(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /BrowserHelm/u })).toBeVisible();
    await expect(this.page.getByLabel('BrowserHelm Agent 消息')).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: '任务' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '高级开发者选项' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '打开模型配置' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: '页面观察' })).toHaveCount(0);
    await expect(this.page.getByText(/Cockpit/u)).toHaveCount(0);
  }

  async expectObservedPage(expected: { title: string; url: string }): Promise<void> {
    await expect(this.page.getByText(expected.title)).toBeVisible();
    await expect(
      this.page.locator('.bh-pageObservationBody span').getByText(new URL(expected.url).hostname, { exact: true })
    ).toBeVisible();
    await expect(this.page.getByText(expected.url)).toHaveCount(0);
  }

  async openDebugTab(tabName: string): Promise<void> {
    await this.openDebug();
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }

  async expectNoLegacyObserveStatusCard(): Promise<void> {
    await expect(
      this.page.getByText('BrowserHelm 已完成当前页面摘要和可交互结构读取。')
    ).toHaveCount(0);
  }

  async expectLongPageArticleRead(): Promise<void> {
    await expect(this.page.getByText('正文读取完成')).toBeVisible();
    await this.openDebugTab('Trace');
    await expect(this.page.getByText('调用工具：bh_page_read_article').first()).toBeVisible();
    await expect(this.page.getByText(/工具结果：bh_page_read_article/u).first()).toBeVisible();
  }

  async expectStreamingMergedResponse(expectedText: string): Promise<void> {
    await expect(this.page.getByText(expectedText, { exact: true })).toBeVisible();
    await this.openDebugTab('Streaming');
    await expect(this.page.locator('.bh-streamingMetrics').getByText('true').first()).toBeVisible();
    await expect(this.page.locator('.bh-streamingMetrics')).toContainText('3');
    await expect(this.page.getByText(expectedText, { exact: true }).first()).toBeVisible();
  }

  async inspectElement(label: string): Promise<void> {
    await this.openDebugTab('元素与表单');
    await this.page.getByRole('button', {
      name: new RegExp(`^检查元素 ${escapeRegExp(label)} `, 'u')
    }).click();
  }

  async stopRun(): Promise<void> {
    await this.page.getByRole('button', { name: '停止任务' }).click();
  }

  async expectCancelled(): Promise<void> {
    await expect(this.page.getByText('已取消', { exact: true })).toBeVisible();
  }

  async expectApprovalDrawer(expected: { action: string; code?: string }): Promise<void> {
    await expect(this.page.getByLabel('Approval')).toBeVisible();
    await expect(this.page.getByLabel('Approval').getByText(expected.action).first()).toBeVisible();
    if (expected.code) {
      await expect(this.page.getByText(expected.code).first()).toBeVisible();
    }
  }

  async expectAgentDiagnosis(expected: {
    modeText: string;
    reportTitle: string;
    finding?: string;
    limitation?: string;
  }): Promise<void> {
    await expect(this.page.getByText(expected.reportTitle)).toBeVisible();
    if (expected.finding) {
      await expect(this.page.getByText(expected.finding, { exact: true }).first()).toBeVisible();
    }
    if (expected.limitation) {
      await expect(this.page.getByText(expected.limitation, { exact: true }).first()).toBeVisible();
    }
    await this.openDebug();
    await expect(this.page.getByText(new RegExp(expected.modeText.includes('form') ? 'form /' : 'debug /', 'u'))).toBeVisible();
  }

  async expectSettingsMasking(expected: { baseUrl: string; model: string }): Promise<void> {
    await this.openSettings();
    await expect(this.page.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
      expected.baseUrl
    );
    await expect(this.page.getByRole('textbox', { name: 'Model' })).toHaveValue(
      expected.model
    );
    await expect(this.page.getByRole('textbox', { name: 'API Key' })).toHaveAttribute(
      'placeholder',
      'sk-...cret'
    );
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
    await this.page.getByRole('button', { name: '保存配置' }).click();
  }

  private async openSettings(): Promise<void> {
    const baseUrl = this.page.getByRole('textbox', { name: 'Base URL' });
    if (await baseUrl.isVisible()) {
      return;
    }
    await this.page.getByRole('button', { name: '打开模型配置' }).click();
    await expect(baseUrl).toBeVisible();
  }

  private async openDebug(): Promise<void> {
    if (await this.page.getByRole('button', { name: /Trace/u }).first().isVisible()) {
      return;
    }
    await this.page.getByRole('button', { name: '高级开发者选项' }).click();
    await expect(this.page.getByRole('button', { name: /Trace/u }).first()).toBeVisible();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
