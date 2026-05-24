import { ContentRpcHandler } from '../page/messaging/content-rpc-handler';

export const contentScript = {
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    const handler = new ContentRpcHandler(document);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      sendResponse(handler.handle(message));
      return false;
    });
  }
};

export default defineContentScript(contentScript);
