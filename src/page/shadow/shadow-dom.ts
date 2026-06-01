import type { ShadowQueryResult, ShadowRootSummary } from '../../shared/schemas/shadow';
import { shadowQueryResultSchema, shadowRootSummarySchema } from '../../shared/schemas/shadow';

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function listShadowRoots(document: Document): ShadowRootSummary[] {
  return Array.from(document.querySelectorAll('*')).flatMap((host) => {
    if (isBrowserHelmInjectedHost(host)) {
      return [];
    }
    const root = host.shadowRoot;
    if (!root) {
      return [];
    }
    return [shadowRootSummarySchema.parse({
      hostSelector: selectorForHost(host),
      hostTagName: host.tagName.toLowerCase(),
      mode: 'open',
      childCount: root.children.length,
      interactiveCount: root.querySelectorAll(INTERACTIVE_SELECTOR).length,
      textPreview: normalizeText(root.textContent ?? '').slice(0, 500)
    })];
  });
}

export function queryShadowRoot(
  document: Document,
  input: { hostSelector: string; selector: string }
): ShadowQueryResult {
  const host = resolveShadowHost(document, input.hostSelector);
  if (!host?.shadowRoot) {
    throw new Error(`Open shadow root not found for host: ${input.hostSelector}`);
  }
  const hostSelector = input.hostSelector === '*' ? selectorForHost(host) : input.hostSelector;
  const elements = Array.from(host.shadowRoot.querySelectorAll(input.selector)).slice(0, 50).map((element) => {
    const name = element.getAttribute('aria-label') ??
      element.getAttribute('alt') ??
      normalizeText(element.textContent ?? '');
    return {
      tagName: element.tagName.toLowerCase(),
      name,
      ...(roleForElement(element) ? { role: roleForElement(element) } : {}),
      ...(element.textContent ? { text: normalizeText(element.textContent).slice(0, 300) } : {})
    };
  });
  return shadowQueryResultSchema.parse({
    hostSelector,
    selector: input.selector,
    elements
  });
}

function resolveShadowHost(document: Document, hostSelector: string): Element | null {
  if (hostSelector === '*') {
    return Array.from(document.querySelectorAll('*')).find((host) =>
      !isBrowserHelmInjectedHost(host) && host.shadowRoot
    ) ?? null;
  }
  return document.querySelector(hostSelector);
}

function isBrowserHelmInjectedHost(host: Element): boolean {
  return host.id === 'browserhelm-floating-entry-host';
}

function selectorForHost(host: Element): string {
  if (host.id) {
    return `#${escapeCssIdent(host.id)}`;
  }
  const tag = host.tagName.toLowerCase();
  const sameTag = Array.from(host.ownerDocument.querySelectorAll(tag));
  const index = sameTag.indexOf(host);
  return index <= 0 ? tag : `${tag}:nth-of-type(${index + 1})`;
}

function roleForElement(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'input') return 'textbox';
  return undefined;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function escapeCssIdent(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/gu, '\\$1');
}
