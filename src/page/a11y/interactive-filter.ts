import type { InteractiveElement } from '../../shared/schemas/structured-page-data.schema';
import { readAccessibleName } from './accessible-name';
import { isDisabledElement, isVisibleElement } from './element-finder';
import type { PageZone } from './interactive-ranker';
import type { RefMap } from './ref-map';
import { resolveRole } from './role-resolver';

const INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a[href]',
  'summary',
  '[role]',
  '[tabindex]'
].join(',');

const ARIA_INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'combobox',
  'option',
  'tab'
]);

export function findInteractiveElements(
  document: Document,
  refMap: RefMap
): InteractiveElement[] {
  return Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
    .filter(isInteractiveElement)
    .map((element, index) => {
      const role = resolveInteractiveRole(element);
      const name = readAccessibleName(element);
      const disabled = isDisabledElement(element);
      const pageZone = inferPageZone(element, role, name);
      const ref = refMap.register(element, {
        role,
        name,
        tagName: element.tagName.toLowerCase(),
        visible: isVisibleElement(element),
        disabled,
        pageZone
      });

      return {
        refId: ref.refId,
        role,
        name,
        tagName: ref.tagName,
        visible: ref.visible,
        disabled,
        checked: readCheckedState(element, role),
        selected: readSelectedState(element, role),
        domOrder: index,
        pageZone,
        warnings: []
      };
    });
}

function isInteractiveElement(element: Element): boolean {
  if (
    element instanceof HTMLInputElement &&
    element.getAttribute('type')?.toLowerCase() === 'hidden'
  ) {
    return false;
  }
  const role = resolveInteractiveRole(element);
  if (!role) {
    return false;
  }
  if (element.hasAttribute('tabindex')) {
    return hasNativeInteractiveSignal(element) || hasNamedRole(element, role);
  }
  return true;
}

function hasNativeInteractiveSignal(element: Element): boolean {
  return ['button', 'input', 'textarea', 'select', 'a', 'summary'].includes(
    element.tagName.toLowerCase()
  );
}

function hasNamedRole(element: Element, role: string): boolean {
  return ARIA_INTERACTIVE_ROLES.has(role) && readAccessibleName(element).length > 0;
}

function resolveInteractiveRole(element: Element): string | undefined {
  const explicitRole = element.getAttribute('role')?.trim();
  if (explicitRole) {
    return ARIA_INTERACTIVE_ROLES.has(explicitRole) ? explicitRole : undefined;
  }
  if (element.tagName.toLowerCase() === 'summary') {
    return 'button';
  }
  return resolveRole(element);
}

function readCheckedState(
  element: Element,
  role: string | undefined
): boolean | undefined {
  if (!role || !['checkbox', 'radio', 'switch'].includes(role)) {
    return undefined;
  }
  if (element instanceof HTMLInputElement) {
    return element.checked;
  }
  const ariaChecked = element.getAttribute('aria-checked');
  return ariaChecked === null ? undefined : ariaChecked === 'true';
}

function readSelectedState(
  element: Element,
  role: string | undefined
): boolean | undefined {
  if (!role || !['option', 'tab'].includes(role)) {
    return undefined;
  }
  if (element instanceof HTMLOptionElement) {
    return element.selected;
  }
  const ariaSelected = element.getAttribute('aria-selected');
  return ariaSelected === null ? undefined : ariaSelected === 'true';
}

function inferPageZone(
  element: Element,
  role: string | undefined,
  accessibleName: string
): PageZone {
  if (element.closest('form')) {
    return 'form';
  }
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return 'form';
  }
  if (
    (role === 'button' || tagName === 'button') &&
    /submit|save|cancel|reset|登录|注册|提交|保存|取消|搜索|登出|sign\s?in|log\s?in|sign\s?up|log\s?out/i.test(accessibleName)
  ) {
    return 'form';
  }
  if (element.closest('nav, header, [role="navigation"], [role="banner"], [role="menubar"]')) {
    return 'nav';
  }
  if (element.closest('main, article, section, [role="main"], [role="article"]')) {
    return 'content';
  }
  if (element.closest('footer, aside, [role="contentinfo"], [role="complementary"]')) {
    return 'other';
  }
  return 'content';
}
