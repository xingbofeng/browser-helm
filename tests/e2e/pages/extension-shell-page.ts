import type { BrowserContext, Worker } from '@playwright/test';

import { CONTENT_RPC_MESSAGES } from '../../../src/shared/constants/event-names';

export class ExtensionShellPage {
  constructor(
    private readonly context: BrowserContext,
    readonly extensionId: string
  ) {}

  async observeActiveTab(): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<unknown, typeof CONTENT_RPC_MESSAGES>(async (messages) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, { type: messages.PAGE_OBSERVE });
    }, CONTENT_RPC_MESSAGES);
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
    const result = await worker.evaluate<unknown, typeof CONTENT_RPC_MESSAGES>(async (messages) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, { type: messages.A11Y_SNAPSHOT });
    }, CONTENT_RPC_MESSAGES);
    return result;
  }

  async resolveActiveTabRef(refId: string): Promise<unknown> {
    const worker = await this.worker();
    const result = await worker.evaluate<
      unknown,
      { refId: string; messages: typeof CONTENT_RPC_MESSAGES }
    >(async ({ refId: id, messages }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return chrome.tabs.sendMessage(tab.id, {
        type: messages.A11Y_RESOLVE_REF,
        refId: id
      });
    }, { refId, messages: CONTENT_RPC_MESSAGES });
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
