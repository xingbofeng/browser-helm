import { resolveRole } from './role-resolver';

const SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="combobox"]'
].join(',');

export function findInteractiveCandidates(document: Document): Element[] {
  return Array.from(document.querySelectorAll(SELECTOR)).filter((element) =>
    Boolean(resolveRole(element))
  );
}

export function isVisibleElement(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }

    const inlineStyle = current.getAttribute('style')?.toLowerCase() ?? '';
    if (
      /display\s*:\s*none/u.test(inlineStyle) ||
      /visibility\s*:\s*(hidden|collapse)/u.test(inlineStyle) ||
      /opacity\s*:\s*0(?:[;\s]|$)/u.test(inlineStyle)
    ) {
      return false;
    }

    const computedStyle = view?.getComputedStyle(current);
    if (
      computedStyle &&
      (computedStyle.display === 'none' ||
        computedStyle.visibility === 'hidden' ||
        computedStyle.visibility === 'collapse' ||
        computedStyle.opacity === '0')
    ) {
      return false;
    }
  }

  return true;
}

export function isDisabledElement(element: Element): boolean {
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}
