import { expect, type Page } from '@playwright/test';

export class CockpitPanel {
  constructor(private readonly page: Page) {}

  async expectShell(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /BrowserHelm/u })).toBeVisible();
    await expect(this.messages()).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: /^(任务|Task)$/u })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /^(打开模型配置|Open settings)$/u })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /^(页面观察|Page observation)$/u })).toHaveCount(0);
    await expect(this.page.getByText(/Cockpit/u)).toHaveCount(0);
  }

  async expectObservedPage(expected: { title: string; url: string }): Promise<void> {
    await expect(this.page.getByText(expected.title)).toBeVisible();
    await expect(
      this.page.locator('.bh-pageObservationBody span').getByText(new URL(expected.url).hostname, { exact: true })
    ).toBeVisible();
    await expect(this.page.getByText(expected.url)).toHaveCount(0);
  }

  async openDebugTab(tabName: string | RegExp): Promise<void> {
    await this.openDebug();
    await this.page.getByRole('button', {
      name: tabName,
      exact: typeof tabName === 'string'
    }).click();
  }

  async expectNoLegacyObserveStatusCard(): Promise<void> {
    await expect(
      this.page.getByText('BrowserHelm 已完成当前页面摘要和可交互结构读取。')
    ).toHaveCount(0);
  }

  async expectNoObserveStatusCards(): Promise<void> {
    await expect(
      this.page
        .getByLabel(/BrowserHelm Agent (消息|messages)/u)
        .getByText(/^(正在观察当前页面|Observing current page)$/u)
    ).toHaveCount(0);
  }

  async expectLongPageArticleRead(): Promise<void> {
    await expect(this.page.getByText(/正文读取完成|Article read (completed|done)/u)).toBeVisible();
    await this.openDebugTab('Trace');
    await expect(this.page.getByText(/(调用工具|Tool call|Calling tool)[:：]\s*bh_page_read_article/u).first()).toBeVisible();
    await expect(this.page.getByText(/(工具结果|Tool result)[:：]\s*bh_page_read_article/u).first()).toBeVisible();
  }

  async expectStreamingMergedResponse(expectedText: string): Promise<void> {
    await expect(
      this.messages().getByText(expectedText, { exact: true })
    ).toBeVisible();
    await this.openDebugTab('Streaming');
    await expect(this.page.locator('.bh-streamingMetrics').getByText('true').first()).toBeVisible();
    await expect(this.page.locator('.bh-streamingMetrics')).toContainText(/Chunk[1-9]\d*/u);
    await expect(
      this.messages().getByText(expectedText, { exact: true })
    ).toBeVisible();
  }

  async inspectElement(label: string): Promise<void> {
    await this.openDebugTab(/^(元素与表单|Elements & Forms)$/u);
    await this.page.getByRole('button', {
      name: new RegExp(`^(检查元素|Inspect element) ${escapeRegExp(label)} `, 'u')
    }).click();
  }

  async stopRun(): Promise<void> {
    await this.page.getByRole('button', { name: /^(停止任务|Stop task)$/u }).click();
  }

  async expectCancelled(): Promise<void> {
    await expect(this.page.getByText(/^(已取消|Cancelled)$/u)).toBeVisible();
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
    await expect(this.page.getByText(diagnosisTextMatcher(expected.reportTitle)).first()).toBeVisible();
    if (expected.finding) {
      await expect(this.page.getByText(diagnosisTextMatcher(expected.finding)).first()).toBeVisible();
    }
    if (expected.limitation) {
      await expect(this.page.getByText(diagnosisTextMatcher(expected.limitation)).first()).toBeVisible();
    }
    await this.openDebug();
    await expect(this.page.getByText(new RegExp(expected.modeText.includes('form') ? 'form /' : 'debug /', 'u')).first()).toBeVisible();
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

  async captureViewportFromHeader(): Promise<void> {
    await this.page.getByRole('button', { name: '截取当前视口' })
      .or(this.page.getByRole('button', { name: 'Capture current viewport' }))
      .first()
      .click();
    const image = this.page.getByRole('img', { name: '当前页面视口截图' })
      .or(this.page.getByRole('img', { name: 'Current page viewport screenshot' }))
      .first();
    await expect(image).toBeVisible();
    const src = await image.getAttribute('src');
    expect(src?.startsWith('data:image/')).toBe(true);
    await expect(this.page.getByText('Captured viewport screenshot').first()).toBeVisible();
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
    await this.page.getByRole('button', { name: /^(保存配置|Save config)$/u }).click();
  }

  private async openSettings(): Promise<void> {
    const baseUrl = this.page.getByRole('textbox', { name: 'Base URL' });
    if (await baseUrl.isVisible()) {
      return;
    }
    await this.page.getByRole('button', { name: /^(打开模型配置|Open settings)$/u }).click();
    await expect(baseUrl).toBeVisible();
  }

  private async openDebug(): Promise<void> {
    if (await this.page.getByRole('button', { name: /Trace/u }).first().isVisible()) {
      return;
    }
    await this.page.getByRole('button', { name: /^(高级开发者选项|Advanced debug options)$/u }).click();
    await expect(this.page.getByRole('button', { name: /Trace/u }).first()).toBeVisible();
  }

  private messages() {
    return this.page.getByLabel(/BrowserHelm Agent (消息|messages)/u);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function diagnosisTextMatcher(value: string): string | RegExp {
  if (value.includes('Form Doctor')) {
    return /Form Doctor (诊断报告|Report)/u;
  }
  if (value.includes('Page Inspector')) {
    return /Page Inspector (诊断报告|Report)/u;
  }
  if (value.includes('必填字段')) {
    return /必填字段为空|Required field empty/u;
  }
  if (value.includes('字段校验')) {
    return /字段校验失败|Field validation failed/u;
  }
  if (value.includes('提交按钮')) {
    return /提交按钮禁用|Submit button disabled/u;
  }
  if (value.toLowerCase().includes('console error')) {
    return /Console error|页面存在 console error/u;
  }
  if (value.includes('CDP')) {
    return /CDP deep inspection|CDP 深度检查/u;
  }
  return value;
}
