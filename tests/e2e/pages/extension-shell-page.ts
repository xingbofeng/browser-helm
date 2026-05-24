import type { BrowserContext, Worker } from '@playwright/test';

export class ExtensionShellPage {
  constructor(
    private readonly context: BrowserContext,
    readonly extensionId: string
  ) {}

  async observeActiveTab(): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<unknown>(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, { type: 'BH_PAGE_OBSERVE' });
    });
    return result;
  }

  async activeTabId(): Promise<number> {
    const worker = await this.worker();
    return await worker.evaluate<number>(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return tab.id;
    });
  }

  async snapshotActiveTab(): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<unknown>(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, { type: 'BH_A11Y_SNAPSHOT' });
    });
    return result;
  }

  async resolveActiveTabRef(refId: string): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<unknown, string>(async (id) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, {
        type: 'BH_A11Y_RESOLVE_REF',
        refId: id
      });
    }, refId);
    return result;
  }

  async sendFrameMessage(
    tabId: number,
    frameId: number,
    message: Record<string, unknown>
  ): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<unknown, {
      targetTabId: number;
      targetFrameId: number;
      payload: Record<string, unknown>;
    }>(
      async ({ targetTabId, targetFrameId, payload }) => {
        const response: unknown = await chrome.tabs.sendMessage(targetTabId, payload, {
          frameId: targetFrameId
        });
        return response;
      },
      {
        targetTabId: tabId,
        targetFrameId: frameId,
        payload: message
      }
    );
    return result;
  }

  private async worker(): Promise<Worker> {
    return (
      this.context.serviceWorkers()[0] ??
      (await this.context.waitForEvent('serviceworker'))
    );
  }
}
