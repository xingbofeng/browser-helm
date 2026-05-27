import { BackgroundRuntimeHost } from '../background/runtime/background-runtime-host';
import {
  bindSidePanelToActiveTab,
  bindSidePanelToTab,
  notifySidePanelsActiveTab,
  notifySidePanelsTargetTabChanged,
  sidePanelPathForTab
} from '../background/runtime/side-panel-target';
import { RUNTIME_MESSAGES, SIDE_PANEL_MESSAGES } from '../shared/constants/event-names';

export default defineBackground(() => {
  const host = new BackgroundRuntimeHost();
  const sidePanelPorts = new Set<chrome.runtime.Port>();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void bindSidePanelToActiveTab();

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === RUNTIME_MESSAGES.SUBSCRIBE_RUN) {
      let unsubscribe: (() => void) | undefined;
      const handleSubscribe = (message: unknown) => {
        const runId = parseRunSubscription(message);
        if (!runId) {
          return;
        }
        unsubscribe?.();
        unsubscribe = host.subscribeRun(runId, (event) => {
          port.postMessage(event);
        });
      };
      port.onMessage.addListener(handleSubscribe);
      port.onDisconnect.addListener(() => {
        unsubscribe?.();
        port.onMessage.removeListener(handleSubscribe);
      });
      return;
    }
    if (port.name !== SIDE_PANEL_MESSAGES.TARGET_PORT) {
      return;
    }
    sidePanelPorts.add(port);
    port.onDisconnect.addListener(() => {
      sidePanelPorts.delete(port);
    });
    void notifySidePanelsActiveTab(sidePanelPorts);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void bindSidePanelToTab(tabId);
    notifySidePanelsTargetTabChanged(sidePanelPorts, tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const changedEnough = Boolean(changeInfo.url) || changeInfo.status === 'complete';
    if (tab.active && changedEnough) {
      void bindSidePanelToTab(tabId);
      notifySidePanelsTargetTabChanged(sidePanelPorts, tabId);
    }
  });

  chrome.commands?.onCommand.addListener((command) => {
    if (command !== 'open-browserhelm-side-panel') {
      return;
    }
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        return;
      }
      void chrome.tabs.sendMessage(tabId, {
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE
      }).catch(() => {
        if (chrome.sidePanel?.open) {
          void bindSidePanelToTab(tabId).then(() => chrome.sidePanel.open({ tabId }));
        }
      });
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isFloatingPanelUrlMessage(message)) {
      const tabId = sender.tab?.id;
      sendResponse({
        ok: Boolean(tabId),
        ...(tabId ? { url: chrome.runtime.getURL(sidePanelPathForTab(tabId)) } : {})
      });
      return false;
    }
    void host.handleMessage(message).then(sendResponse);
    return true;
  });
});

function parseRunSubscription(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const runId = (message as { runId?: unknown }).runId;
  return typeof runId === 'string' && runId.length > 0 ? runId : undefined;
}

function isFloatingPanelUrlMessage(value: unknown): value is {
  type: typeof SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL;
} {
  return Boolean(value) &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).type === SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL;
}
