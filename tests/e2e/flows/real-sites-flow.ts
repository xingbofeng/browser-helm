import { expect, type Page } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RunSnapshot } from '../../../src/runtime/runtime-messages';
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
    const page = await this.flowContext.context.newPage();
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    return page;
  }

  private async observeActiveRealTab(
    task: string,
    isReady: (snapshot: RunSnapshot) => boolean = (snapshot) =>
      (snapshot.structuredPageData?.forms.items.length ?? 0) > 0
  ): Promise<RunSnapshot> {
    const tabId = await this.flowContext.shell().activeTabId();
    let latest: RunSnapshot | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      latest = await this.sidePanel.runOnTab({
        tabId,
        task,
        mode: 'form',
        runKind: 'observe_only'
      });
      if (isReady(latest)) {
        return latest;
      }
      await this.sidePanel.pageObject.waitForTimeout(1_000);
    }
    if (!latest) {
      throw new Error('Unable to observe real site');
    }
    return latest;
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
