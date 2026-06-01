import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

import { TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { ProviderSettings } from '../../../src/storage/interfaces/settings-store';
import type { RunSnapshot } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';
import type {
  RealModelScenario,
  RealModelScenarioResult
} from '../real-sites/model-scenarios/types';

export class RealModelScenarioRunner {
  private readonly helpers: RealModelScenarioHelpers;

  private constructor(private readonly flowContext: E2EFlowContext) {
    this.helpers = createScenarioHelpers();
  }

  static async start(): Promise<RealModelScenarioRunner> {
    return new RealModelScenarioRunner(await E2EFlowContext.create());
  }

  async run(
    scenario: RealModelScenario,
    settings: ProviderSettings
  ): Promise<RealModelScenarioResult> {
    const page = await this.openRealPage(scenario.url);
    await scenario.beforeRun?.(page, this.helpers);
    const tabId = await this.flowContext.shell().activeTabId();
    await this.configureRealModel(tabId, settings, [
      ...(scenario.enabledDomains ?? []),
      ...domainFromUrl(page.url())
    ]);

    const beforeUrl = page.url();
    const snapshot = await this.flowContext.sidePanel().runOnTab({
      tabId,
      task: scenario.task,
      mode: scenario.mode,
      runKind: scenario.runKind,
      pollAttempts: scenario.pollAttempts ?? 720,
      pollIntervalMs: 250
    });

    dumpRuntimeSnapshot(scenario.dumpName, snapshot);
    expect(snapshot.status, JSON.stringify(snapshot.error ?? {})).toBe('finished');
    expectRealModelTrace(snapshot, settings);
    if (settings.apiKey) {
      expect(JSON.stringify(snapshot)).not.toContain(settings.apiKey);
    }

    const result = {
      page,
      snapshot,
      beforeUrl,
      settings
    };
    await scenario.assert(result, this.helpers);
    return result;
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }

  private async configureRealModel(
    tabId: number,
    settings: ProviderSettings,
    enabledDomains: string[] = []
  ): Promise<void> {
    const sidePanel = this.flowContext.sidePanel();
    await sidePanel.open(tabId);
    await sidePanel.setProviderSettings({
      ...settings,
      apiKey: settings.apiKey ?? '',
      streamingEnabled: settings.streamingEnabled ?? true
    });
    if (enabledDomains.length > 0) {
      await sidePanel.setDomainPolicy({
        enabledDomains
      });
    }
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
}

export type RealModelScenarioHelpers = ReturnType<typeof createScenarioHelpers>;

function createScenarioHelpers() {
  return {
    expectFinalMessage(snapshot: RunSnapshot, pattern: RegExp): void {
      expect(finalMessageContent(snapshot)).toMatch(pattern);
    },

    expectSearchValue(locator: Locator, value: string): Promise<void> {
      return expect(locator.first()).toHaveValue(value, {
        timeout: 10_000
      });
    },

    expectTool(snapshot: RunSnapshot, tool: string): void {
      expect(traceHasTool(snapshot, tool)).toBe(true);
    },

    expectToolResult(snapshot: RunSnapshot, tool: string): void {
      expect(traceHasToolResult(snapshot, tool)).toBe(true);
    },

    expectToolCountAtLeast(snapshot: RunSnapshot, tool: string, count: number): void {
      expect(traceToolCount(snapshot, tool)).toBeGreaterThanOrEqual(count);
    },

    expectFormFill(snapshot: RunSnapshot): void {
      expect(
        traceHasTool(snapshot, TOOL_NAMES.FORM_FILL_MANY) ||
        traceHasTool(snapshot, TOOL_NAMES.FORM_FILL_FIELD)
      ).toBe(true);
    },

    finalMessageContent,
    sameOriginAndPath,
    waitForAppleRegistrationForm,
    waitForBodyText,
    readAppleWidgetValues
  };
}

function expectRealModelTrace(snapshot: RunSnapshot, settings: ProviderSettings): void {
  expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.MODEL_STREAM_STARTED)).toBe(true);
  expect(snapshot.trace?.some((event) =>
    event.type === TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED ||
    event.type === TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
  )).toBe(true);
  expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.MODEL_DECISION)).toBe(true);
  expect(snapshot.streaming).toMatchObject({
    model: settings.model,
    active: false
  });
}

function finalMessageContent(snapshot: RunSnapshot): string {
  return snapshot.messages?.find((message) => message.id === `${snapshot.runId}:agent-final`)?.content ?? '';
}

function traceHasTool(snapshot: RunSnapshot, tool: string): boolean {
  return snapshot.trace?.some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
    readStringField(event.payload, 'tool') === tool
  ) === true;
}

function traceToolCount(snapshot: RunSnapshot, tool: string): number {
  return snapshot.trace?.filter((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
    readStringField(event.payload, 'tool') === tool
  ).length ?? 0;
}

function traceHasToolResult(snapshot: RunSnapshot, tool: string): boolean {
  return snapshot.trace?.some((event) =>
    event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
    readStringField(event.payload, 'tool') === tool &&
    readRecord(event.payload)?.ok === true
  ) === true;
}

function readStringField(value: unknown, key: string): string {
  const record = readRecord(value);
  const field = record?.[key];
  return typeof field === 'string' ? field : '';
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function sameOriginAndPath(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.origin === rightUrl.origin && leftUrl.pathname === rightUrl.pathname;
  } catch {
    return left === right;
  }
}

function domainFromUrl(url: string): string[] {
  try {
    return [new URL(url).hostname];
  } catch {
    return [];
  }
}

function dumpRuntimeSnapshot(name: string, snapshot: RunSnapshot): void {
  const dir = join(process.cwd(), 'artifacts', 'runtime-traces');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}-${snapshot.runId}.json`),
    JSON.stringify(snapshot, null, 2)
  );
}

async function waitForAppleRegistrationForm(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    for (const frame of page.frames()) {
      if (!frame.url().includes('appleid.apple.com/widget')) {
        continue;
      }
      const hasNameField = await frame.locator('[name="lastName"]').count().catch(() => 0);
      if (hasNameField > 0) {
        return;
      }
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error('Apple registration form did not become ready');
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
      const value = (selector: string) =>
        (document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? '');
      const checked = (selector: string) =>
        (document.querySelector<HTMLInputElement>(selector)?.checked ?? false);
      return {
        lastName: value('[name="lastName"]'),
        firstName: value('[name="firstName"]'),
        country: value('[name="countrySelect"]'),
        birthValues: Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
          .map((select) => select.value),
        appleId: value('[name="appleId"]'),
        password: value('[name="password"]'),
        confirmPassword: value('[name="confirmPassword"]'),
        phoneNumber: value('[name="phoneNumber"]'),
        captcha: value('[name="captcha"]'),
        appleUpdates: checked('[name="appleUpdates"]'),
        iTunesUpdates: checked('[name="iTunesUpdates"]')
      };
    });
  }
  return {};
}

async function waitForBodyText(page: Page, expected: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const text = await page.locator('body').innerText({
      timeout: 2_000
    }).catch(() => '');
    if (expected.test(text) || text.trim().length > 20) {
      return;
    }
    await page.waitForTimeout(1_000);
  }
}
