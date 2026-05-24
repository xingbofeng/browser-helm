import { SIDE_PANEL_MESSAGES } from '../../shared/constants/event-names';

export function sidePanelPathForTab(tabId: number): string {
  return `sidepanel.html?target=active&tabId=${tabId}`;
}

export async function bindSidePanelToTab(tabId: number): Promise<void> {
  if (!globalThis.chrome?.sidePanel?.setOptions) {
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: sidePanelPathForTab(tabId),
    enabled: true
  });
}

export async function bindSidePanelToActiveTab(): Promise<void> {
  if (!globalThis.chrome?.tabs?.query) {
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (tab?.id) {
    await bindSidePanelToTab(tab.id);
  }
}

export function targetTabChangedMessage(tabId: number): {
  type: string;
  tabId: number;
} {
  return {
    type: SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED,
    tabId
  };
}

export function notifySidePanelsTargetTabChanged(
  ports: Iterable<chrome.runtime.Port>,
  tabId: number
): void {
  const message = targetTabChangedMessage(tabId);
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch {
      // Disconnected ports are removed via onDisconnect; ignore races.
    }
  }
}

export async function notifySidePanelsActiveTab(
  ports: Iterable<chrome.runtime.Port>
): Promise<void> {
  if (!globalThis.chrome?.tabs?.query) {
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (tab?.id) {
    notifySidePanelsTargetTabChanged(ports, tab.id);
  }
}
