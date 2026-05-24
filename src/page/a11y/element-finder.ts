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
  if (element.hasAttribute('hidden')) {
    return false;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return !style.includes('display: none') && !style.includes('visibility: hidden');
}

export function isDisabledElement(element: Element): boolean {
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}
