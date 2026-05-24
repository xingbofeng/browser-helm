import { BackgroundRuntimeHost } from '../background/runtime/background-runtime-host';
import {
  bindSidePanelToActiveTab,
  bindSidePanelToTab,
  notifySidePanelsActiveTab,
  notifySidePanelsTargetTabChanged
} from '../background/runtime/side-panel-target';
import { SIDE_PANEL_MESSAGES } from '../shared/constants/event-names';

export default defineBackground(() => {
  const host = new BackgroundRuntimeHost();
  const sidePanelPorts = new Set<chrome.runtime.Port>();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void bindSidePanelToActiveTab();

  chrome.runtime.onConnect.addListener((port) => {
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void host.handleMessage(message).then(sendResponse);
    return true;
  });
});
