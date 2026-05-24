import type { InteractiveElement } from '../../shared/schemas/structured-page-data.schema';
import { readAccessibleName } from './accessible-name';
import { isDisabledElement, isVisibleElement } from './element-finder';
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
      const ref = refMap.register(element, {
        role,
        name,
        tagName: element.tagName.toLowerCase(),
        visible: isVisibleElement(element),
        disabled
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
