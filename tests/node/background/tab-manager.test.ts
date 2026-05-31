import { afterEach, describe, expect, it, vi } from 'vitest';

import { TabManager } from '../../../src/background/tab-manager';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TabManager', () => {
  it('lists tabs with query and fragment redacted from URLs', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          {
            id: 11,
            windowId: 1,
            active: true,
            title: 'Checkout',
            url: 'https://shop.example.com/pay?token=secret#card',
            status: 'complete',
            pinned: false,
            audible: false
          }
        ])
      }
    });

    const manager = new TabManager();
    const tabs = await manager.listTabs();

    expect(tabs).toEqual([expect.objectContaining({
      tabId: 11,
      windowId: 1,
      active: true,
      title: 'Checkout',
      url: 'https://shop.example.com/pay',
      origin: 'https://shop.example.com',
      status: 'complete'
    })]);
  });

  it('returns the active tab for the current window', async () => {
    const query = vi.fn(async () => [{
      id: 12,
      windowId: 2,
      active: true,
      title: 'Docs',
      url: 'https://docs.example.com/',
      status: 'complete'
    }]);
    vi.stubGlobal('chrome', { tabs: { query } });

    const manager = new TabManager();
    const tab = await manager.getActiveTab();

    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(tab?.tabId).toBe(12);
  });

  it('focuses a tab and its window', async () => {
    const update = vi.fn(async () => ({
      id: 13,
      windowId: 3,
      active: true,
      title: 'Target',
      url: 'https://target.example.com/',
      status: 'complete'
    }));
    const windowUpdate = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', {
      tabs: { update },
      windows: { update: windowUpdate }
    });

    const manager = new TabManager();
    const tab = await manager.focusTab(13);

    expect(update).toHaveBeenCalledWith(13, { active: true });
    expect(windowUpdate).toHaveBeenCalledWith(3, { focused: true });
    expect(tab.tabId).toBe(13);
  });
});
