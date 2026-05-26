import { ContentRpcHandler } from '../page/messaging/content-rpc-handler';

const CONTENT_SCRIPT_INSTALLED_MARKER = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';
const PAGE_HEALTH_BRIDGE_MARKER = '__BROWSER_HELM_PAGE_HEALTH_BRIDGE__';
const PAGE_HEALTH_EVENT = 'BROWSER_HELM_PAGE_HEALTH_EVENT';

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
    installPageHealthBridge(globalScope);

    const handler = new ContentRpcHandler(document);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      sendResponse(handler.handle(message));
      return false;
    });
  }
};

export default defineContentScript(contentScript);

function installPageHealthBridge(globalScope: Record<string, unknown>): void {
  if (globalScope[PAGE_HEALTH_BRIDGE_MARKER]) {
    return;
  }
  globalScope[PAGE_HEALTH_BRIDGE_MARKER] = true;
  globalScope.__browserHelmConsoleErrors = [];
  globalScope.__browserHelmNetworkFailures = [];
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      !isPageHealthEvent(event.data)
    ) {
      return;
    }
    if (event.data.kind === 'console_error') {
      const consoleErrors = readGlobalArray(globalScope, '__browserHelmConsoleErrors');
      consoleErrors.push({
        message: event.data.message,
        source: event.data.source
      });
      globalScope.__browserHelmConsoleErrors = consoleErrors.slice(-20);
      return;
    }
    const networkFailures = readGlobalArray(globalScope, '__browserHelmNetworkFailures');
    networkFailures.push({
      url: event.data.url,
      method: event.data.method,
      errorText: event.data.errorText,
      status: event.data.status
    });
    globalScope.__browserHelmNetworkFailures = networkFailures.slice(-20);
  });
}

function readGlobalArray(scope: Record<string, unknown>, key: string): unknown[] {
  const value = scope[key];
  return Array.isArray(value) ? value : [];
}

function isPageHealthEvent(value: unknown): value is {
  channel: typeof PAGE_HEALTH_EVENT;
  kind: 'console_error' | 'network_failure';
  message?: string;
  source?: string;
  url?: string;
  method?: string;
  errorText?: string;
  status?: number;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.channel === PAGE_HEALTH_EVENT &&
    (record.kind === 'console_error' || record.kind === 'network_failure');
}
