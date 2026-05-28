import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindSidePanelToTab,
  bindSidePanelToActiveTab,
  floatingPanelPathForTab,
  notifySidePanelsTargetTabChanged,
  sidePanelPathForTab,
  sidePanelSurfaceFromSender,
  sidePanelTargetTabIdFromUrl,
  targetTabChangedMessage
} from '../../../src/background/runtime/side-panel-target';
import { SIDE_PANEL_MESSAGES } from '../../../src/shared/constants/event-names';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sidePanelPathForTab', () => {
  it('生成含 target=active 和 tabId 的路径', () => {
    expect(sidePanelPathForTab(42)).toBe('sidepanel.html?target=active&tabId=42');
  });

  it('不同 tabId 生成不同路径', () => {
    const a = sidePanelPathForTab(1);
    const b = sidePanelPathForTab(999);
    expect(a).not.toBe(b);
    expect(a).toContain('tabId=1');
    expect(b).toContain('tabId=999');
  });
});

describe('floatingPanelPathForTab', () => {
  it('生成 floating surface 路径，避免和原生 side panel URL 混淆', () => {
    expect(floatingPanelPathForTab(42)).toBe('sidepanel.html?target=active&tabId=42&surface=floating');
  });
});

describe('sidePanelTargetTabIdFromUrl', () => {
  it('从 side panel URL 读取目标 tabId', () => {
    expect(sidePanelTargetTabIdFromUrl('chrome-extension://id/sidepanel.html?target=active&tabId=42')).toBe(42);
  });

  it('缺少或非法 tabId 时返回 undefined', () => {
    expect(sidePanelTargetTabIdFromUrl('chrome-extension://id/sidepanel.html')).toBeUndefined();
    expect(sidePanelTargetTabIdFromUrl('not a url')).toBeUndefined();
  });
});

describe('sidePanelSurfaceFromSender', () => {
  it('识别页面内嵌 floating surface', () => {
    expect(sidePanelSurfaceFromSender({
      url: 'chrome-extension://id/sidepanel.html?tabId=42&surface=floating',
      hasSenderTab: true
    })).toBe('floating');
  });

  it('sender.tab 存在且没有 floating 标记时视为调试 tab', () => {
    expect(sidePanelSurfaceFromSender({
      url: 'chrome-extension://id/sidepanel.html?tabId=42',
      hasSenderTab: true
    })).toBe('debug_tab');
  });

  it('sender.tab 不存在且没有 floating 标记时视为原生 side panel', () => {
    expect(sidePanelSurfaceFromSender({
      url: 'chrome-extension://id/sidepanel.html?target=active&tabId=42',
      hasSenderTab: false
    })).toBe('native');
  });
});

describe('targetTabChangedMessage', () => {
  it('生成包含正确类型和 tabId 的消息', () => {
    const msg = targetTabChangedMessage(100);
    expect(msg.type).toBe(SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED);
    expect(msg.tabId).toBe(100);
  });
});

describe('bindSidePanelToTab', () => {
  it('当 chrome.sidePanel.setOptions 不可用时直接返回', async () => {
    const domainGlobal = globalThis as unknown as { chrome?: unknown };
    domainGlobal.chrome = undefined;
    // 不应抛出
    await expect(bindSidePanelToTab(1)).resolves.toBeUndefined();
  });

  it('调用 chrome.sidePanel.setOptions 并传入正确参数', async () => {
    const setOptions = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      sidePanel: { setOptions }
    });

    await bindSidePanelToTab(42);

    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'sidepanel.html?target=active&tabId=42',
      enabled: true
    });
  });
});

describe('bindSidePanelToActiveTab', () => {
  it('当 chrome.tabs.query 不可用时直接返回', async () => {
    const domainGlobal = globalThis as unknown as { chrome?: unknown };
    domainGlobal.chrome = undefined;
    await expect(bindSidePanelToActiveTab()).resolves.toBeUndefined();
  });

  it('查询 active tab 并绑定', async () => {
    const setOptions = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue([{ id: 7, active: true, currentWindow: true }]);
    vi.stubGlobal('chrome', {
      tabs: { query },
      sidePanel: { setOptions }
    });

    await bindSidePanelToActiveTab();

    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidepanel.html?target=active&tabId=7',
      enabled: true
    });
  });

  it('无 active tab 时不调用 setOptions', async () => {
    const setOptions = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('chrome', {
      tabs: { query },
      sidePanel: { setOptions }
    });

    await bindSidePanelToActiveTab();
    expect(setOptions).not.toHaveBeenCalled();
  });
});

describe('notifySidePanelsTargetTabChanged', () => {
  it('向所有端口发送 TARGET_TAB_CHANGED 消息', () => {
    const postMessage = vi.fn();
    const ports = [
      { postMessage, disconnect: vi.fn(), onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() }, onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, name: 'port-a' },
      { postMessage, disconnect: vi.fn(), onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() }, onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, name: 'port-b' }
    ] as Iterable<chrome.runtime.Port>;

    notifySidePanelsTargetTabChanged(ports, 42);

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({
      type: SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED,
      tabId: 42
    });
  });

  it('端口 postMessage 失败时忽略异常', () => {
    const goodPost = vi.fn();
    const badPost = vi.fn().mockImplementation(() => {
      throw new Error('disconnected');
    });
    const ports = [
      { postMessage: goodPost, disconnect: vi.fn(), onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() }, onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, name: 'good' },
      { postMessage: badPost, disconnect: vi.fn(), onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() }, onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, name: 'bad' }
    ] as Iterable<chrome.runtime.Port>;

    // 不应抛出
    expect(() => {
      notifySidePanelsTargetTabChanged(ports, 1);
    }).not.toThrow();

    expect(goodPost).toHaveBeenCalledTimes(1);
    expect(badPost).toHaveBeenCalledTimes(1);
  });

  it('空端口集合不报错', () => {
    expect(() => {
      notifySidePanelsTargetTabChanged([] as Iterable<chrome.runtime.Port>, 5);
    }).not.toThrow();
  });
});
