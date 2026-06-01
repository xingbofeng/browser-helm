import { expect, type Page } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RunMode } from '../../../src/shared/schemas/tool.schema';
import type {
  RunSnapshot,
  RuntimeToolExecutionResult
} from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';
import type { SidePanelPage } from '../pages/side-panel-page';

type FormField = {
  refId: string;
  label?: string | undefined;
  name?: string | undefined;
  type: string;
  valuePreview?: string | undefined;
  writable?: {
    actualValue?: string | undefined;
  } | undefined;
};

type FillManyResult = {
  ok: boolean;
  data?: {
    filledCount?: number;
    failedCount?: number;
  };
};

type InteractiveElement = {
  refId: string;
  role?: string | undefined;
  name?: string | undefined;
  tagName: string;
  visible: boolean;
  disabled: boolean;
};

export class RealSitesFlow {
  private readonly sidePanel: SidePanelPage;

  private constructor(private readonly flowContext: E2EFlowContext) {
    this.sidePanel = flowContext.sidePanel();
  }

  static async start(): Promise<RealSitesFlow> {
    return new RealSitesFlow(await E2EFlowContext.create());
  }

  async expectGoogleSearchFill(): Promise<void> {
    const page = await this.openRealPage('https://www.google.com/');
    const snapshot = await this.observeActiveRealTab('填写 Google 搜索框');
    const field = findField(snapshot, (item) =>
      item.name === 'q' ||
      /搜索|search/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: '美国'
      }
    ], 1);

    await expect(page.locator('textarea[name="q"], input[name="q"]').first()).toHaveValue('美国');
  }

  async expectWikipediaArticleReadAndScroll(): Promise<void> {
    const snapshot = await this.observeRealPage({
      url: 'https://en.wikipedia.org/wiki/Web_accessibility',
      task: '观察 Wikipedia Web accessibility 文章',
      mode: 'debug',
      isReady: (candidate) =>
        /web accessibility|accessibility/i.test(pageText(candidate)) &&
        (candidate.structuredPageData?.refs.count ?? 0) > 10
    });

    await this.expectArticleText(snapshot.runId, /web accessibility|assistive technologies/i);
    await this.expectInteractiveRefs(snapshot.runId, /contents|edit|search/i);

    const before = await this.viewportInfo(snapshot.runId);
    const scroll = await executeToolResult(this.sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.VIEWPORT_SCROLL,
      args: {
        direction: 'down',
        amount: 'page'
      }
    }));
    expect(scroll.ok, JSON.stringify(scroll)).toBe(true);
    expect(scroll.changedPage).toBe(true);

    const after = await this.viewportInfo(snapshot.runId);
    expect(readNumberField(after.data, 'scrollY')).toBeGreaterThan(readNumberField(before.data, 'scrollY') ?? -1);
  }

  async expectYouTubeSearchBoxFill(): Promise<void> {
    const page = await this.openRealPage('https://www.youtube.com/results?search_query=web+accessibility');
    const snapshot = await this.observeActiveRealTab('填写 YouTube 搜索框', (candidate) =>
      formFields(candidate).some((field) =>
        field.name === 'search_query' ||
        /search|搜索/i.test(`${field.label ?? ''} ${field.name ?? ''}`)
      )
    );
    const field = findField(snapshot, (item) =>
      item.name === 'search_query' ||
      /search|搜索/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: 'keyboard accessibility'
      }
    ], 1);

    await expect(page.locator('input[name="search_query"]').first()).toHaveValue('keyboard accessibility');
    await this.expectInteractiveRefs(snapshot.runId, /search|guide|menu|video/i);
  }

  async expectRedditFeedObservation(): Promise<void> {
    const snapshot = await this.observeRealPage({
      url: 'https://www.reddit.com/r/webdev/',
      task: '观察 Reddit webdev feed',
      mode: 'debug',
      isReady: (candidate) =>
        /reddit/i.test(`${candidate.observation?.url ?? ''} ${pageText(candidate)}`) &&
        (candidate.structuredPageData?.interactive.count ?? 0) > 0
    });

    expect(snapshot.status).toBe('observed');
    const text = pageText(snapshot);
    if (/blocked|error|unusual traffic|enable javascript|request failed/i.test(text)) {
      expect(snapshot.structuredPageData?.interactive.count ?? 0).toBeGreaterThan(0);
      return;
    }
    await this.expectVisibleText(snapshot.runId, /reddit|webdev|posts|comments|log in|open app/i);
    await this.expectInteractiveRefs(snapshot.runId, /search|log in|create|comments|vote|menu|open/i);
  }

  async expectAmazonSearchObservationOrFill(): Promise<void> {
    const page = await this.openRealPage('https://www.amazon.com/');
    const snapshot = await this.observeActiveRealTab('观察 Amazon 首页搜索入口', (candidate) =>
      /amazon/i.test(pageText(candidate)) &&
      (
        formFields(candidate).some((field) =>
          field.name === 'field-keywords' ||
          /search amazon|search/i.test(`${field.label ?? ''} ${field.name ?? ''}`)
        ) ||
        (candidate.structuredPageData?.interactive.count ?? 0) > 0
      )
    );
    const field = formFields(snapshot).find((item) =>
      item.name === 'field-keywords' ||
      /search amazon|search/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );
    if (!field) {
      expect(pageText(snapshot)).toMatch(/amazon/i);
      expect(snapshot.structuredPageData?.interactive.count ?? 0).toBeGreaterThan(0);
      return;
    }

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: 'ergonomic keyboard'
      }
    ], 1);

    await expect(page.locator('input[name="field-keywords"], input#twotabsearchtextbox').first()).toHaveValue('ergonomic keyboard');
  }

  async expectGithubSearchFill(): Promise<void> {
    const page = await this.openRealPage('https://github.com/search');
    const snapshot = await this.observeActiveRealTab('填写 GitHub 搜索框');
    const field = findField(snapshot, (item) =>
      item.name === 'q' ||
      /search github|搜索/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: 'browser helm'
      }
    ], 1);

    await expect(page.locator('input[name="q"], input[placeholder*="Search"]').first()).toHaveValue('browser helm');
  }

  async expectStackOverflowQuestionsObservationOrSearchFill(): Promise<void> {
    const page = await this.openRealPage('https://stackoverflow.com/questions');
    const snapshot = await this.observeActiveRealTab('观察 Stack Overflow questions 搜索入口', (candidate) =>
      /stack overflow|just a moment/i.test(pageText(candidate)) &&
      (
        formFields(candidate).some((field) =>
          field.name === 'q' ||
          /search|搜索/i.test(`${field.label ?? ''} ${field.name ?? ''}`)
        ) ||
        (candidate.structuredPageData?.interactive.count ?? 0) > 0
      )
    );
    if (/just a moment|cloudflare|checking/i.test(pageText(snapshot))) {
      expect(snapshot.structuredPageData?.interactive.count ?? 0).toBeGreaterThan(0);
      return;
    }
    const field = findField(snapshot, (item) =>
      item.name === 'q' ||
      /search|搜索/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: 'playwright extension'
      }
    ], 1);

    await expect(page.locator('input[name="q"]').first()).toHaveValue('playwright extension');
  }

  async expectMdnArticleObservation(): Promise<void> {
    const snapshot = await this.observeRealPage({
      url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility',
      task: '观察 MDN Accessibility 文档',
      mode: 'debug',
      isReady: (candidate) =>
        /accessibility|mdn|web/i.test(pageText(candidate)) &&
        (candidate.structuredPageData?.refs.count ?? 0) > 10
    });

    await this.expectArticleText(snapshot.runId, /accessibility|assistive technology|web content/i);
    await this.expectInteractiveRefs(snapshot.runId, /search|theme|language|feedback|menu/i);
  }

  async expectBbcNewsObservation(): Promise<void> {
    const snapshot = await this.observeRealPage({
      url: 'https://www.bbc.com/news',
      task: '观察 BBC News 首页',
      mode: 'debug',
      isReady: (candidate) =>
        /bbc|news/i.test(pageText(candidate)) &&
        (candidate.structuredPageData?.interactive.count ?? 0) > 0
    });

    const pageSummary = pageText(snapshot);
    expect(pageSummary).toMatch(/bbc|news/i);
    await this.expectInteractiveRefs(snapshot.runId, /home|news|search|menu|sign in/i);
  }

  async expectUsaGovSearchFill(): Promise<void> {
    const page = await this.openRealPage('https://www.usa.gov/');
    const snapshot = await this.observeActiveRealTab('填写 USA.gov 搜索框', (candidate) =>
      formFields(candidate).some((field) =>
        field.type !== 'hidden' &&
        /search|query/i.test(`${field.label ?? ''} ${field.name ?? ''}`)
      )
    );
    const field = findField(snapshot, (item) =>
      item.type !== 'hidden' &&
      /search|query/i.test(`${item.label ?? ''} ${item.name ?? ''}`)
    );

    await this.fillFields(snapshot.runId, [
      {
        fieldRefId: field.refId,
        value: 'passport renewal'
      }
    ], 1);

    await expect(page.locator('input[type="search"]:visible, input[name*="query"]:visible').first()).toHaveValue('passport renewal');
  }

  async expectAppleRegistrationLowRiskFill(): Promise<void> {
    const page = await this.openRealPage('https://account.apple.com/account');
    const snapshot = await this.observeActiveRealTab('填写 Apple 注册页低敏字段，不提交', (candidate) =>
      formFields(candidate).some((field) => field.name === 'lastName')
    );
    const fields = formFields(snapshot);
    const targetFields = [
      valueFor(findFieldByName(fields, 'lastName'), 'Counter'),
      valueFor(findFieldByName(fields, 'firstName'), 'Test'),
      valueFor(findFieldByName(fields, 'countrySelect'), 'USA'),
      valueFor(findSelectByCurrentValue(fields, '0000'), '2000'),
      valueFor(findSelectByCurrentValue(fields, '00', 0), '01'),
      valueFor(findSelectByCurrentValue(fields, '00', 1), '01'),
      ...fields
        .filter((field) =>
          field.type === 'checkbox' &&
          /营销|通知|电子邮件|updates|marketing/i.test(`${field.label ?? ''} ${field.name ?? ''}`)
        )
        .map((field) => valueFor(field, 'false'))
    ];

    await this.fillFields(snapshot.runId, targetFields, 8);

    const values = await readAppleWidgetValues(page);
    expect(values).toMatchObject({
      lastName: 'Counter',
      firstName: 'Test',
      country: 'USA',
      birthValues: expect.arrayContaining(['2000', '01']),
      appleId: '',
      password: '',
      confirmPassword: '',
      phoneNumber: '',
      captcha: '',
      appleUpdates: false,
      iTunesUpdates: false
    });
  }

  async expectAnthropicToolsForAgentsArticleObservation(): Promise<void> {
    await this.openRealPage('https://www.anthropic.com/engineering/writing-tools-for-agents');
    const snapshot = await this.observeActiveRealTab(
      '观察 Anthropic tools for agents 文章',
      (candidate) =>
        /writing effective tools|tools for agents|anthropic/i.test(
          `${candidate.observation?.title ?? ''} ${candidate.observation?.visibleTextSummary ?? ''}`
        )
    );
    const visibleText = snapshot.observation?.visibleTextSummary ?? '';
    const pageText = `${snapshot.observation?.title ?? ''} ${visibleText}`;

    expect(snapshot.status).toBe('observed');
    expect(pageText).toMatch(/writing effective tools|tools for agents|anthropic/i);
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }

  private async openRealPage(url: string): Promise<Page> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const page = await this.flowContext.context.newPage();
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000
        });
        await page.bringToFront();
        return page;
      } catch (error) {
        lastError = error;
        await page.close().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw new Error(`Unable to open real site ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private async observeRealPage(input: {
    url: string;
    task: string;
    mode: RunMode;
    isReady: (snapshot: RunSnapshot) => boolean;
  }): Promise<RunSnapshot> {
    await this.openRealPage(input.url);
    return await this.observeActiveRealTab(input.task, input.isReady, input.mode);
  }

  private async observeActiveRealTab(
    task: string,
    isReady: (snapshot: RunSnapshot) => boolean = (snapshot) =>
      (snapshot.structuredPageData?.forms.items.length ?? 0) > 0,
    mode: RunMode = 'form'
  ): Promise<RunSnapshot> {
    const tabId = await this.flowContext.shell().activeTabId();
    let latest: RunSnapshot | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      latest = await this.sidePanel.runOnTab({
        tabId,
        task,
        mode,
        runKind: 'observe_only'
      });
      if (isReady(latest)) {
        await this.enableObservedDomain(latest);
        return latest;
      }
      await this.sidePanel.pageObject.waitForTimeout(1_000);
    }
    if (!latest) {
      throw new Error('Unable to observe real site');
    }
    throw new Error([
      `Real site did not become ready for task: ${task}`,
      `status=${latest.status}`,
      `url=${latest.observation?.url ?? 'unknown'}`,
      `title=${latest.observation?.title ?? 'unknown'}`,
      `forms=${latest.structuredPageData?.forms.count ?? 0}`,
      `interactive=${latest.structuredPageData?.interactive.count ?? 0}`,
      `refs=${latest.structuredPageData?.refs.count ?? 0}`
    ].join(' '));
  }

  private async expectVisibleText(runId: string, pattern: RegExp): Promise<void> {
    const result = await executeToolResult(this.sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
      args: {
        maxChars: 12_000
      }
    }));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(readStringField(result.data, 'text')).toMatch(pattern);
  }

  private async expectArticleText(runId: string, pattern: RegExp): Promise<void> {
    const result = await executeToolResult(this.sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.PAGE_READ_ARTICLE,
      args: {
        maxChars: 15_000,
        includeHeadings: true,
        includeLinks: true,
        linkLimit: 80
      }
    }));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(readStringField(result.data, 'text')).toMatch(pattern);
  }

  private async expectInteractiveRefs(runId: string, expectedName: RegExp): Promise<void> {
    const result = await executeToolResult(this.sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.A11Y_FIND_INTERACTIVE,
      args: {}
    }));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const elements = readArrayField(result.data, 'elements') as InteractiveElement[];
    expect(elements.length).toBeGreaterThan(0);
    expect(elements.some((element) =>
      expectedName.test(`${element.role ?? ''} ${element.name ?? ''} ${element.tagName}`)
    )).toBe(true);
  }

  private async viewportInfo(runId: string): Promise<RuntimeToolExecutionResult> {
    const result = await executeToolResult(this.sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.VIEWPORT_GET_INFO,
      args: {}
    }));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    return result;
  }

  private async fillFields(
    runId: string,
    fields: Array<{ fieldRefId: string; value: string }>,
    minFilledCount: number
  ): Promise<void> {
    const result = await this.sidePanel.executeTool({
      runId,
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields
      }
    }) as FillManyResult;

    expect(result).toMatchObject({
      ok: true
    });
    expect(result.data?.filledCount ?? 0).toBeGreaterThanOrEqual(minFilledCount);
    expect(result.data?.failedCount ?? 0).toBe(0);
  }

  private async enableObservedDomain(snapshot: RunSnapshot): Promise<void> {
    const domain = snapshot.observation?.currentDomain;
    if (!domain) {
      return;
    }
    await this.sidePanel.setDomainPolicy({
      enabledDomains: [domain]
    });
  }
}

async function executeToolResult(
  promise: Promise<unknown>
): Promise<RuntimeToolExecutionResult> {
  const result = await promise;
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof (result as RuntimeToolExecutionResult).ok !== 'boolean' ||
    typeof (result as RuntimeToolExecutionResult).code !== 'string'
  ) {
    throw new Error('Unexpected runtime tool result');
  }
  return result as RuntimeToolExecutionResult;
}

function formFields(snapshot: RunSnapshot): FormField[] {
  return (snapshot.structuredPageData?.forms.items ?? []).map((item) => ({
    refId: item.refId,
    label: item.label,
    name: item.name,
    type: item.type,
    valuePreview: item.valuePreview,
    writable: item.writable
  }));
}

function pageText(snapshot: RunSnapshot): string {
  return `${snapshot.observation?.title ?? ''} ${snapshot.observation?.visibleTextSummary ?? ''}`;
}

function findField(
  snapshot: RunSnapshot,
  predicate: (field: FormField) => boolean
): FormField {
  const field = formFields(snapshot).find(predicate);
  if (!field) {
    throw new Error(`Unable to find field in ${snapshot.observation?.url ?? 'page'}`);
  }
  return field;
}

function findFieldByName(fields: FormField[], name: string): FormField {
  const field = fields.find((item) => item.name === name);
  if (!field) {
    throw new Error(`Unable to find field by name: ${name}`);
  }
  return field;
}

function findSelectByCurrentValue(
  fields: FormField[],
  value: string,
  skip = 0
): FormField {
  const matches = fields.filter((item) =>
    item.type === 'select' &&
    item.writable?.actualValue === value
  );
  const field = matches[skip] ?? fields.filter((item) => item.type === 'select')[skip + 1];
  if (!field) {
    throw new Error(`Unable to find select field for value: ${value}`);
  }
  return field;
}

function valueFor(field: FormField, value: string): { fieldRefId: string; value: string } {
  return {
    fieldRefId: field.refId,
    value
  };
}

function readStringField(value: unknown, key: string): string {
  const record = readRecord(value);
  const field = record?.[key];
  return typeof field === 'string' ? field : '';
}

function readNumberField(value: unknown, key: string): number | undefined {
  const record = readRecord(value);
  const field = record?.[key];
  return typeof field === 'number' ? field : undefined;
}

function readArrayField(value: unknown, key: string): unknown[] {
  const record = readRecord(value);
  const field = record?.[key];
  return Array.isArray(field) ? field : [];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

async function readAppleWidgetValues(page: Page): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const values = await readAppleWidgetValuesOnce(page);
    if (values.lastName === 'Counter') {
      return values;
    }
    await page.waitForTimeout(500);
  }
  return await readAppleWidgetValuesOnce(page);
}

async function readAppleWidgetValuesOnce(page: Page): Promise<Record<string, unknown>> {
  for (const frame of page.frames()) {
    if (!frame.url().includes('appleid.apple.com/widget')) {
      continue;
    }
    return await frame.evaluate(() => {
      const read = (selector: string): string | undefined => {
        const element = document.querySelector(selector);
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return element.value;
        }
        return undefined;
      };
      const checked = (name: string): boolean | undefined => {
        const element = document.querySelector(`input[name="${name}"]`);
        return element instanceof HTMLInputElement ? element.checked : undefined;
      };
      return {
        lastName: read('[name="lastName"]'),
        firstName: read('[name="firstName"]'),
        country: read('[name="countrySelect"]'),
        birthValues: Array.from(document.querySelectorAll('select')).map((element) => element.value),
        appleId: read('[name="appleId"], input[type="email"]'),
        password: read('[name="password"]'),
        confirmPassword: read('[name="confirmPassword"]'),
        phoneNumber: read('[name="phoneNumber"], input[type="tel"]'),
        captcha: read('[name="captcha"]'),
        appleUpdates: checked('appleUpdates'),
        iTunesUpdates: checked('iTunesUpdates')
      };
    });
  }
  throw new Error('Apple account widget frame not found');
}
