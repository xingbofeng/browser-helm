import type { BrowserContext, Page } from '@playwright/test';

import { RUNTIME_MESSAGES } from '../../../src/shared/constants/event-names';
import type { BrowserHelmDomainPolicy } from '../../../src/shared/domain-policy';
import { BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY } from '../../../src/shared/domain-policy';
import type { RunMode } from '../../../src/shared/schemas/tool.schema';
import type { RunSnapshot } from '../../../src/runtime/runtime-messages';

export class SidePanelPage {
  private page: Page | undefined;

  constructor(
    private readonly context: BrowserContext,
    private readonly extensionId: string
  ) {}

  async open(tabId?: number): Promise<Page> {
    this.page = await this.context.newPage();
    const tabParam = tabId ? `?tabId=${tabId}` : '';
    await this.page.goto(`chrome-extension://${this.extensionId}/sidepanel.html${tabParam}`);
    return this.page;
  }

  async openRun(runId: string): Promise<Page> {
    this.page = await this.context.newPage();
    await this.page.goto(`chrome-extension://${this.extensionId}/sidepanel.html?runId=${runId}`);
    return this.page;
  }

  async setProviderSettings(settings: {
    baseUrl: string;
    model: string;
    apiKey: string;
    streamingEnabled?: boolean;
    allowLocalProviderEndpoints?: boolean;
  }): Promise<void> {
    const page = this.pageObject;
    await page.evaluate(async (providerSettings) => {
      await chrome.storage.local.set({ providerSettings });
    }, settings);
    await page.reload();
  }

  async setDomainPolicy(policy: BrowserHelmDomainPolicy): Promise<void> {
    const page = this.pageObject;
    await page.evaluate(async ({ key, value }) => {
      await chrome.storage.local.set({ [key]: value });
    }, {
      key: BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY,
      value: policy
    });
    await page.reload();
  }

  async runOnTab(input: {
    tabId: number;
    task: string;
    mode: RunMode;
    runKind?: 'observe_only' | 'diagnose' | 'answer' | 'form_assist';
    pollAttempts?: number;
    pollIntervalMs?: number;
    continueOnEmpty?: boolean;
  }): Promise<RunSnapshot> {
    const page = await this.open(input.tabId);
    return await page.evaluate(async ({ runtimeMessages, pollAttempts, pollIntervalMs, ...runInput }) => {
      type RuntimeSuccess<T> = { ok: true; data: T };
      type RuntimeFailure = { ok: false; message: string };
      const isSuccess = <T>(value: unknown): value is RuntimeSuccess<T> =>
        typeof value === 'object' &&
        value !== null &&
        (value as { ok?: unknown }).ok === true &&
        'data' in value;
      const failureMessage = (value: unknown, fallback: string): string =>
        typeof value === 'object' &&
        value !== null &&
        (value as RuntimeFailure).ok === false &&
        typeof (value as RuntimeFailure).message === 'string'
          ? (value as RuntimeFailure).message
          : fallback;

      const started: unknown = await chrome.runtime.sendMessage({
        type: runtimeMessages.START_RUN,
        input: runInput
      });
      if (!isSuccess<{ runId: string }>(started)) {
        throw new Error(failureMessage(started, 'Unable to start run'));
      }

      let snapshot: RuntimeSuccess<RunSnapshot> | undefined;
      const maxAttempts = typeof pollAttempts === 'number' ? pollAttempts : 200;
      const intervalMs = typeof pollIntervalMs === 'number' ? pollIntervalMs : 100;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const nextSnapshot: unknown = await chrome.runtime.sendMessage({
          type: runtimeMessages.GET_SNAPSHOT,
          runId: started.data.runId
        });
        if (!isSuccess<RunSnapshot>(nextSnapshot)) {
          throw new Error(failureMessage(nextSnapshot, 'Unable to read run snapshot'));
        }
        snapshot = nextSnapshot;
        const stillRunning = ['created', 'observing', 'thinking', 'executing_tool'].includes(snapshot.data.status) ||
          (snapshot.data.status === 'observed' && runInput.runKind !== 'observe_only') ||
          (snapshot.data.status === 'empty' && runInput.runKind !== 'observe_only' && runInput.continueOnEmpty === true);
        if (!stillRunning) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      if (!snapshot) {
        throw new Error('Unable to read run snapshot');
      }
      return snapshot.data;
    }, { ...input, runtimeMessages: RUNTIME_MESSAGES });
  }

  async executeTool(input: {
    runId: string;
    tool: string;
    args: Record<string, unknown>;
    source?: 'agent' | 'runtime' | 'user';
  }): Promise<unknown> {
    const page = this.pageObject;
    return await page.evaluate(async ({ runtimeMessages, ...toolInput }) => {
      type RuntimeSuccess<T> = { ok: true; data: T };
      type RuntimeFailure = { ok: false; message: string };
      const isSuccess = <T>(value: unknown): value is RuntimeSuccess<T> =>
        typeof value === 'object' &&
        value !== null &&
        (value as { ok?: unknown }).ok === true &&
        'data' in value;
      const failureMessage = (value: unknown, fallback: string): string =>
        typeof value === 'object' &&
        value !== null &&
        (value as RuntimeFailure).ok === false &&
        typeof (value as RuntimeFailure).message === 'string'
          ? (value as RuntimeFailure).message
          : fallback;

      const result: unknown = await chrome.runtime.sendMessage({
        type: runtimeMessages.EXECUTE_TOOL,
        input: toolInput
      });
      if (!isSuccess<unknown>(result)) {
        throw new Error(failureMessage(result, 'Unable to execute tool'));
      }
      return result.data;
    }, { ...input, runtimeMessages: RUNTIME_MESSAGES });
  }

  async highlightRef(input: {
    runId: string;
    refId: string;
  }): Promise<unknown> {
    const page = this.pageObject;
    return await page.evaluate(async ({ runtimeMessages, ...highlightInput }) => {
      type RuntimeSuccess<T> = { ok: true; data: T };
      const result: unknown = await chrome.runtime.sendMessage({
        type: runtimeMessages.HIGHLIGHT_REF,
        input: highlightInput
      });
      if (
        typeof result !== 'object' ||
        result === null ||
        (result as { ok?: unknown }).ok !== true ||
        !('data' in result)
      ) {
        throw new Error('Unable to highlight ref');
      }
      return (result as RuntimeSuccess<unknown>).data;
    }, { ...input, runtimeMessages: RUNTIME_MESSAGES });
  }

  async snapshot(runId: string): Promise<RunSnapshot> {
    const page = this.pageObject;
    return await page.evaluate(async ({ runId: targetRunId, runtimeMessages }) => {
      type RuntimeSuccess<T> = { ok: true; data: T };
      const result: unknown = await chrome.runtime.sendMessage({
        type: runtimeMessages.GET_SNAPSHOT,
        runId: targetRunId
      });
      if (
        typeof result !== 'object' ||
        result === null ||
        (result as { ok?: unknown }).ok !== true ||
        !('data' in result)
      ) {
        throw new Error('Unable to read run snapshot');
      }
      return (result as RuntimeSuccess<RunSnapshot>).data;
    }, { runId, runtimeMessages: RUNTIME_MESSAGES });
  }

  async decideApproval(input: {
    runId: string;
    requestId: string;
    decision: 'approved' | 'denied';
    reason?: string;
  }): Promise<unknown> {
    const page = this.pageObject;
    return await page.evaluate(async ({ runtimeMessages, ...decisionInput }) => {
      type RuntimeSuccess<T> = { ok: true; data: T };
      const result: unknown = await chrome.runtime.sendMessage({
        type: runtimeMessages.DECIDE_APPROVAL,
        input: decisionInput
      });
      if (
        typeof result !== 'object' ||
        result === null ||
        (result as { ok?: unknown }).ok !== true ||
        !('data' in result)
      ) {
        throw new Error('Unable to decide approval');
      }
      return (result as RuntimeSuccess<unknown>).data;
    }, { ...input, runtimeMessages: RUNTIME_MESSAGES });
  }

  get pageObject(): Page {
    if (!this.page) {
      throw new Error('Side panel page is not open');
    }
    return this.page;
  }
}
