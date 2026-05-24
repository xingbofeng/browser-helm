import { ContentRpcHandler } from '../page/messaging/content-rpc-handler';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const handler = new ContentRpcHandler(document);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      sendResponse(handler.handle(message));
      return false;
    });
  }
});
