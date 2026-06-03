import { browserTabSummarySchema, type BrowserTabSummary } from '../shared/schemas/tab';
import { redactTextForModelContext } from '../shared/redaction';

export class TabManager {
  async listTabs(): Promise<BrowserTabSummary[]> {
    if (!globalThis.chrome?.tabs?.query) {
      throw new Error('chrome.tabs.query unavailable');
    }
    const tabs = await chrome.tabs.query({});
    return tabs.flatMap((tab) => {
      const summary = toTabSummary(tab);
      return summary ? [summary] : [];
    });
  }

  async getActiveTab(): Promise<BrowserTabSummary | undefined> {
    if (!globalThis.chrome?.tabs?.query) {
      throw new Error('chrome.tabs.query unavailable');
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? toTabSummary(tab) : undefined;
  }

  async focusTab(tabId: number): Promise<BrowserTabSummary> {
    if (!globalThis.chrome?.tabs?.update) {
      throw new Error('chrome.tabs.update unavailable');
    }
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (!tab) {
      throw new Error(`Unable to focus tab ${tabId}`);
    }
    if (tab.windowId !== undefined && typeof globalThis.chrome?.windows?.update === 'function') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    const summary = toTabSummary(tab);
    if (!summary) {
      throw new Error(`Unable to focus tab ${tabId}`);
    }
    return summary;
  }
}

export const defaultTabManager = new TabManager();

function toTabSummary(tab: chrome.tabs.Tab): BrowserTabSummary | undefined {
  if (tab.id === undefined || tab.windowId === undefined) {
    return undefined;
  }
  const safeUrl = sanitizeTabUrl(tab.url);
  return browserTabSummarySchema.parse({
    tabId: tab.id,
    windowId: tab.windowId,
    active: tab.active === true,
    title: tab.title ?? '',
    ...(safeUrl ? { url: safeUrl.url, origin: safeUrl.origin } : {}),
    ...(tab.status ? { status: tab.status } : {}),
    ...(tab.pinned === undefined ? {} : { pinned: tab.pinned }),
    ...(tab.audible === undefined ? {} : { audible: tab.audible })
  });
}

function sanitizeTabUrl(rawUrl: string | undefined): { url: string; origin: string } | undefined {
  if (!rawUrl) {
    return undefined;
  }
  try {
    const parsed = new URL(rawUrl);
    return {
      url: redactTextForModelContext(`${parsed.origin}${parsed.pathname}`),
      origin: parsed.origin
    };
  } catch {
    return { url: redactTextForModelContext(rawUrl.split(/[?#]/u)[0] ?? rawUrl), origin: '' };
  }
}
