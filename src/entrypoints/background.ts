import { BackgroundRuntimeHost } from '../background/runtime/background-runtime-host';
import { RunManager } from '../background/runtime/run-manager';
import {
  handleSelectionCommand,
  handleSelectionContextMenuClick,
  registerSelectionContextMenus
} from '../background/selection-context-menu';
import {
  isFloatingPanelOpenNativeMessage,
  isFloatingPanelUrlMessage,
  parseRunSubscription
} from '../background/runtime/background-message-guards';
import {
  bindSidePanelToRun,
  bindSidePanelToActiveTab,
  bindSidePanelToTab,
  floatingPanelPathForTab,
  notifySidePanelsActiveTab,
  notifySidePanelsTargetTabChanged,
  openSidePanelForUserGesture,
  sidePanelSurfaceFromSender,
  sidePanelTargetTabIdFromUrl,
  type SidePanelSurface
} from '../background/runtime/side-panel-target';
import { RUNTIME_MESSAGES, SIDE_PANEL_MESSAGES } from '../shared/constants/event-names';

export default defineBackground(() => {
  const runManager = new RunManager();
  const host = new BackgroundRuntimeHost(runManager);
  const sidePanelPorts = new Set<chrome.runtime.Port>();
  const sidePanelPortTargets = new Map<chrome.runtime.Port, {
    surface: SidePanelSurface;
    targetTabId?: number | undefined;
  }>();
  const nativeSidePanelTabIds = new Set<number>();
  // 先绑定 side panel path 到 active tab，再开启 click-to-open
  // 否则用户点击扩展图标时 sidePanel.open() 可能因 path 未绑定而报错
  bindSidePanelToActiveTab()
    .then(() => {
      void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    })
    .catch(() => undefined);

  if (globalThis.chrome?.contextMenus) {
    registerSelectionContextMenus({
      contextMenus: chrome.contextMenus,
      onClick: (info, tab) => {
        void handleSelectionContextMenuClick(info, tab, {
          startRun: (input) => runManager.startRun(input),
          executeTool: (input) => runManager.executeTool(input),
          openSidePanelForTab,
          openSidePanelForRun
        });
      }
    });
  }

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
    const surface = sidePanelSurfaceFromSender({
      url: port.sender?.url,
      hasSenderTab: Boolean(port.sender?.tab?.id)
    });
    sidePanelPortTargets.set(port, { surface });
    if (surface === 'native') {
      const targetTabId = sidePanelTargetTabIdFromUrl(port.sender?.url);
      if (targetTabId) {
        registerNativeSidePanelPort(port, targetTabId);
      } else {
        void readActiveTabId().then((tabId) => {
          if (tabId && sidePanelPorts.has(port)) {
            registerNativeSidePanelPort(port, tabId);
          }
        });
      }
    }
    sidePanelPorts.add(port);
    port.onDisconnect.addListener(() => {
      sidePanelPorts.delete(port);
      unregisterSidePanelPort(port);
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
    if (command === 'open-browserhelm-side-panel') {
      void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          return;
        }
        void chrome.tabs.sendMessage(tabId, {
          type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE
        }).catch(() => undefined);
      });
      return;
    }
    void handleSelectionCommand(command, {
      startRun: (input) => runManager.startRun(input),
      executeTool: (input) => runManager.executeTool(input),
      openSidePanelForTab,
      openSidePanelForRun
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isFloatingPanelUrlMessage(message)) {
      const tabId = sender.tab?.id;
      sendResponse({
        ok: Boolean(tabId),
        ...(tabId
          ? {
              tabId,
              nativeOpen: nativeSidePanelTabIds.has(tabId),
              url: chrome.runtime.getURL(floatingPanelPathForTab(tabId))
            }
          : {})
      });
      return false;
    }
    if (isFloatingPanelOpenNativeMessage(message)) {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, opened: false, reason: 'missing_sender_tab' });
        return false;
      }
      if (nativeSidePanelTabIds.has(tabId)) {
        sendResponse({ ok: true, opened: true, alreadyOpen: true });
        return false;
      }
      void openNativeSidePanel(tabId).then(sendResponse);
      return true;
    }
    void host.handleMessage(message, {
      senderId: sender.id,
      senderUrl: sender.url,
      senderOrigin: sender.origin,
      isExtensionPage: Boolean(sender.url?.startsWith(chrome.runtime.getURL(''))),
      isContentScript: !sender.url?.startsWith(chrome.runtime.getURL('')) && Boolean(sender.tab)
    }).then(sendResponse);
    return true;
  });

  function registerNativeSidePanelPort(port: chrome.runtime.Port, tabId: number): void {
    sidePanelPortTargets.set(port, {
      surface: 'native',
      targetTabId: tabId
    });
    nativeSidePanelTabIds.add(tabId);
    void closeFloatingPanel(tabId);
  }

  function unregisterSidePanelPort(port: chrome.runtime.Port): void {
    const target = sidePanelPortTargets.get(port);
    sidePanelPortTargets.delete(port);
    if (target?.surface !== 'native' || !target.targetTabId) {
      return;
    }
    if (!hasNativeSidePanelPortForTab(target.targetTabId)) {
      nativeSidePanelTabIds.delete(target.targetTabId);
    }
  }

  function hasNativeSidePanelPortForTab(tabId: number): boolean {
    for (const target of sidePanelPortTargets.values()) {
      if (target.surface === 'native' && target.targetTabId === tabId) {
        return true;
      }
    }
    return false;
  }

  async function openNativeSidePanel(tabId: number): Promise<{
    ok: boolean;
    opened: boolean;
    reason?: string | undefined;
  }> {
    if (!globalThis.chrome?.sidePanel?.open) {
      return { ok: false, opened: false, reason: 'side_panel_open_unavailable' };
    }
    try {
      await bindSidePanelToTab(tabId);
      await chrome.sidePanel.open({ tabId });
      return { ok: true, opened: true };
    } catch (error) {
      return {
        ok: false,
        opened: false,
        reason: error instanceof Error ? error.message : 'side_panel_open_failed'
      };
    }
  }

  async function openSidePanelForRun(tabId: number, runId: string): Promise<void> {
    if (!globalThis.chrome?.sidePanel?.open) {
      return;
    }
    await bindSidePanelToRun(tabId, runId);
    notifySidePanelsTargetTabChanged(sidePanelPorts, tabId, runId);
    await chrome.sidePanel.open({ tabId });
  }

  async function openSidePanelForTab(tabId: number): Promise<void> {
    await openSidePanelForUserGesture(tabId);
  }

  async function readActiveTabId(): Promise<number | undefined> {
    if (!globalThis.chrome?.tabs?.query) {
      return undefined;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  async function closeFloatingPanel(tabId: number): Promise<void> {
    await chrome.tabs.sendMessage(tabId, {
      type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_CLOSE
    }).catch(() => undefined);
  }
});
