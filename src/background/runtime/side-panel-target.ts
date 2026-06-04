import { SIDE_PANEL_MESSAGES } from '../../shared/constants/event-names';

export type SidePanelSurface = 'native' | 'floating' | 'debug_tab';

export function sidePanelPathForTab(tabId: number): string {
  return `sidepanel.html?target=active&tabId=${tabId}`;
}

export function sidePanelPathForRun(tabId: number, runId: string): string {
  return `${sidePanelPathForTab(tabId)}&runId=${encodeURIComponent(runId)}`;
}

export function floatingPanelPathForTab(tabId: number): string {
  return `sidepanel.html?target=active&tabId=${tabId}&surface=floating`;
}

export function sidePanelTargetTabIdFromUrl(url: string | undefined): number | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const tabId = Number(new URL(url).searchParams.get('tabId'));
    return Number.isFinite(tabId) && tabId > 0 ? tabId : undefined;
  } catch {
    return undefined;
  }
}

export function sidePanelSurfaceFromSender(input: {
  url?: string | undefined;
  hasSenderTab?: boolean | undefined;
}): SidePanelSurface {
  try {
    const surface = input.url ? new URL(input.url).searchParams.get('surface') : undefined;
    if (surface === 'floating') {
      return 'floating';
    }
  } catch {
    // Malformed sender URLs cannot be trusted as floating panels.
  }
  return input.hasSenderTab ? 'debug_tab' : 'native';
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

export async function bindSidePanelToRun(tabId: number, runId: string): Promise<void> {
  if (!globalThis.chrome?.sidePanel?.setOptions) {
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: sidePanelPathForRun(tabId, runId),
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

export function targetTabChangedMessage(tabId: number, runId?: string): {
  type: string;
  tabId: number;
  runId?: string;
} {
  return {
    type: SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED,
    tabId,
    ...(runId ? { runId } : {})
  };
}

export function notifySidePanelsTargetTabChanged(
  ports: Iterable<chrome.runtime.Port>,
  tabId: number,
  runId?: string
): void {
  const message = targetTabChangedMessage(tabId, runId);
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
