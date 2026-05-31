import { ERROR_CODES } from '../../shared/constants/error-codes';
import type { ContentRpcResponse } from './content-rpc.schema';

export function highlightElement(element: Element): void {
  ensureHighlightStyle(element.ownerDocument);
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'auto'
    });
  }
  element.classList.add('bh-page-ref-highlight');
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  ownerWindow.setTimeout(() => {
    element.classList.remove('bh-page-ref-highlight');
  }, 3_000);
}

export function isDisabled(element: Element): boolean {
  return element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true';
}

export function isSensitiveInput(element: Element): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const type = element.type.toLowerCase();
  const autocomplete = element.autocomplete.toLowerCase();
  return type === 'password' ||
    autocomplete.includes('password') ||
    /password|token|secret|otp|api.?key/i.test(
      `${element.id} ${element.name} ${element.getAttribute('aria-label') ?? ''}`
    );
}

export function writeTextValue(element: Element, text: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    element.value = text;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.textContent = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }
  return false;
}

export function describeResolvedElement(element: Element, refId: string): Record<string, unknown> {
  return {
    refId,
    role: element.getAttribute('role') ?? inferElementRole(element),
    name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
    tagName: element.tagName.toLowerCase(),
    visible: !isElementHidden(element),
    disabled: isDisabled(element)
  };
}

export function formActionUnauthorized(): ContentRpcResponse {
  return {
    ok: false,
    code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED,
    message: 'Form mutations must be routed through the runtime tool boundary'
  };
}

export function iframeActionUnauthorized(): ContentRpcResponse {
  return {
    ok: false,
    code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED,
    message: 'Iframe mutations must be routed through the runtime tool boundary'
  };
}

export function createOpaqueToken(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}_${cryptoObject.randomUUID()}`;
  }
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

function ensureHighlightStyle(document: Document): void {
  if (document.getElementById('browserhelm-ref-highlight-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'browserhelm-ref-highlight-style';
  style.textContent = `
    .bh-page-ref-highlight {
      outline: 3px solid #3f8f57 !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 7px rgba(127, 186, 114, 0.28) !important;
      scroll-margin: 30vh 30vw !important;
      transition: outline-color 120ms ease, box-shadow 120ms ease !important;
    }
  `;
  document.head?.append(style);
}

function isElementHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return style.includes('display: none') || style.includes('visibility: hidden');
}

function inferElementRole(element: Element): string {
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLSelectElement) return 'combobox';
  return element.tagName.toLowerCase();
}
