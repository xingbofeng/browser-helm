import { BackgroundRuntimeHost } from '../background/runtime/background-runtime-host';

export default defineBackground(() => {
  const host = new BackgroundRuntimeHost();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void host.handleMessage(message).then(sendResponse);
    return true;
  });
});
