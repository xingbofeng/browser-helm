import { ContentRpcHandler } from '../page/messaging/content-rpc-handler';
import { SIDE_PANEL_MESSAGES } from '../shared/constants/event-names';

const CONTENT_SCRIPT_INSTALLED_MARKER = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';
const PAGE_HEALTH_BRIDGE_MARKER = '__BROWSER_HELM_PAGE_HEALTH_BRIDGE__';
const PAGE_HEALTH_EVENT = 'BROWSER_HELM_PAGE_HEALTH_EVENT';
const FLOATING_ENTRY_HOST_ID = 'browserhelm-floating-entry-host';

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
    const floatingPanel = installFloatingPanel();

    const handler = new ContentRpcHandler(document);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isFloatingPanelToggleMessage(message)) {
        void floatingPanel?.toggle();
        sendResponse({ ok: true });
        return false;
      }
      void Promise.resolve(handler.handle(message)).then(sendResponse);
      return true;
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

function installFloatingPanel(): { toggle(): Promise<void> } | undefined {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    window.top !== window ||
    !document.documentElement ||
    document.getElementById(FLOATING_ENTRY_HOST_ID)
  ) {
    return undefined;
  }

  const host = document.createElement('div');
  host.id = FLOATING_ENTRY_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const iconUrl = safeRuntimeGetUrl('icons/icon-16.png') ?? '';
  const fallbackPanelUrl = safeRuntimeGetUrl('sidepanel.html?target=active');
  let open = false;
  let panelUrlPromise: Promise<string | undefined> | undefined;

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        --browserhelm-panel-width: min(430px, calc(100vw - 86px));
      }

      .entry {
        all: initial;
        position: fixed;
        right: 12px;
        top: 62%;
        z-index: 2147483647;
        width: 32px;
        height: 32px;
        transform: translateY(-50%);
        transition:
          right 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none;
      }

      :host([data-open="true"]) .entry {
        right: calc(var(--browserhelm-panel-width) + 12px);
        transform: translateY(-50%) scale(1.03);
      }

      .entryButton {
        all: initial;
        position: relative;
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(91, 124, 148, 0.28);
        border-radius: 12px;
        background:
          radial-gradient(circle at 35% 22%, rgba(255, 255, 255, 0.98), rgba(255, 250, 240, 0.92) 42%, rgba(238, 246, 255, 0.92)),
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(242, 248, 252, 0.94));
        box-shadow:
          0 12px 26px rgba(32, 44, 54, 0.14),
          0 2px 8px rgba(32, 44, 54, 0.07),
          inset 0 1px 0 rgba(255, 255, 255, 0.94);
        cursor: pointer;
        pointer-events: auto;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          transform 160ms ease;
      }

      .entryButton:hover,
      .entryButton:focus-visible {
        border-color: rgba(58, 131, 181, 0.48);
        box-shadow:
          0 16px 32px rgba(32, 44, 54, 0.18),
          0 0 0 4px rgba(70, 145, 196, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.96);
        outline: none;
        transform: translateX(-2px) scale(1.06);
      }

      img {
        width: 20px;
        height: 20px;
        display: block;
        object-fit: contain;
        filter: drop-shadow(0 2px 2px rgba(38, 50, 56, 0.14));
      }

      .badge {
        position: absolute;
        right: -3px;
        bottom: -2px;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.95);
        border-radius: 999px;
        background: #7fd37b;
        box-shadow: 0 3px 6px rgba(40, 80, 52, 0.16);
        opacity: 0;
        transform: scale(0.6);
        transition:
          opacity 160ms ease,
          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      :host([data-open="true"]) .badge {
        opacity: 1;
        transform: scale(1);
      }

      .badge::after {
        content: "";
        position: absolute;
        left: 5px;
        top: 3px;
        width: 5px;
        height: 9px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .panel {
        all: initial;
        position: fixed;
        top: 0;
        right: 0;
        z-index: 2147483646;
        width: var(--browserhelm-panel-width);
        height: 100vh;
        background: #fffaf0;
        border-left: 1px solid rgba(203, 213, 225, 0.72);
        box-shadow:
          -18px 0 44px rgba(15, 23, 42, 0.14),
          -2px 0 8px rgba(15, 23, 42, 0.08);
        transform: translateX(104%);
        transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
        overflow: hidden;
        pointer-events: none;
      }

      :host([data-open="true"]) .panel {
        transform: translateX(0);
        pointer-events: auto;
      }

      iframe {
        all: initial;
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #fffaf0;
      }
    </style>
    <div class="entry">
      <button class="entryButton" type="button" title="BrowserHelm (Ctrl+Shift+B / Opt+Shift+B)" aria-label="打开或收起 BrowserHelm 面板">
        <img src="${iconUrl}" alt="" aria-hidden="true" />
        <span class="badge" aria-hidden="true"></span>
      </button>
    </div>
    <aside class="panel" aria-label="BrowserHelm 面板"></aside>
  `;

  document.documentElement.append(host);
  const button = shadow.querySelector<HTMLButtonElement>('.entryButton');
  const panel = shadow.querySelector<HTMLElement>('.panel');
  button?.addEventListener('click', () => {
    void toggle().catch(handleFloatingPanelToggleError);
  });
  window.addEventListener('keydown', (event) => {
    if (!isFloatingPanelShortcut(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void toggle().catch(handleFloatingPanelToggleError);
  }, true);

  return { toggle };

  async function toggle(): Promise<void> {
    if (!open && panel && !panel.querySelector('iframe')) {
      const panelUrl = await getFloatingPanelUrl();
      if (!panelUrl) {
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = panelUrl;
      iframe.title = 'BrowserHelm';
      panel.append(iframe);
    }
    open = !open;
    if (open) {
      host.setAttribute('data-open', 'true');
    } else {
      host.removeAttribute('data-open');
    }
  }

  async function getFloatingPanelUrl(): Promise<string | undefined> {
    panelUrlPromise ??= requestFloatingPanelUrl().catch(() => fallbackPanelUrl);
    return panelUrlPromise;
  }

  async function requestFloatingPanelUrl(): Promise<string | undefined> {
    if (!isRuntimeMessagingAvailable()) {
      return fallbackPanelUrl;
    }
    try {
      const response: unknown = await chrome.runtime.sendMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL
      });
        if (
          response &&
          typeof response === 'object' &&
          typeof (response as { url?: unknown }).url === 'string'
        ) {
          return (response as { url: string }).url;
        }
      return fallbackPanelUrl;
    } catch {
      return fallbackPanelUrl;
    }
  }

  function handleFloatingPanelToggleError(): void {
    // Chrome invalidates old content-script extension contexts during extension reloads.
    // Keep the page quiet: the next toggle/navigation will get a fresh content script.
  }
}

function safeRuntimeGetUrl(path: string): string | undefined {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return undefined;
  }
}

function isRuntimeMessagingAvailable(): boolean {
  try {
    return Boolean(chrome.runtime.id && chrome.runtime.sendMessage);
  } catch {
    return false;
  }
}

function isFloatingPanelShortcut(event: KeyboardEvent): boolean {
  return event.shiftKey &&
    (event.ctrlKey || event.altKey) &&
    (event.code === 'KeyB' || event.key.toLowerCase() === 'b');
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

function isFloatingPanelToggleMessage(value: unknown): value is {
  type: typeof SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (value as Record<string, unknown>).type === SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE;
}
