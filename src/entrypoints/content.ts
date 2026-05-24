import { ContentRpcHandler } from '../page/messaging/content-rpc-handler';

const CONTENT_SCRIPT_INSTALLED_MARKER = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';

export const contentScript = {
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    const globalScope = globalThis as Record<string, unknown>;
    if (globalScope[CONTENT_SCRIPT_INSTALLED_MARKER]) {
      return;
    }
    globalScope[CONTENT_SCRIPT_INSTALLED_MARKER] = true;

    const handler = new ContentRpcHandler(document);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      sendResponse(handler.handle(message));
      return false;
    });
  }
};

export default defineContentScript(contentScript);
