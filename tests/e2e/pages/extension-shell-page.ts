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
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const pageTabs = tabs.filter((tab) =>
        tab.id !== undefined &&
        typeof tab.url === 'string' &&
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('chrome://') &&
        tab.url !== 'about:blank'
      );
      const [tab] = pageTabs.sort((left, right) =>
        (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0)
      );
      if (!tab?.id) {
        throw new Error('No active tab');
      }
      return tab.id;
    });
  }

  async nativeSidePanelOptions(tabId: number): Promise<{
    ok: boolean;
    path?: string | undefined;
    enabled?: boolean | undefined;
    reason?: string | undefined;
  }> {
    const worker = await this.worker();
    return await worker.evaluate(async (targetTabId) => {
      const sidePanel = chrome.sidePanel as {
        setOptions?: (options: { tabId: number; path: string; enabled: boolean }) => Promise<void>;
        getOptions?: (options: { tabId: number }) => Promise<{ path?: string; enabled?: boolean }>;
      } | undefined;
      if (!sidePanel?.setOptions || !sidePanel.getOptions) {
        return { ok: false, reason: 'side_panel_options_unavailable' };
      }
      const path = `sidepanel.html?target=active&tabId=${targetTabId}`;
      await sidePanel.setOptions({
        tabId: targetTabId,
        path,
        enabled: true
      });
      const options = await sidePanel.getOptions({ tabId: targetTabId });
      return {
        ok: true,
        path: options.path,
        enabled: options.enabled
      };
    }, tabId);
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
