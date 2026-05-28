import { ERROR_CODES } from '../../shared/constants/error-codes';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import type { StructuredPageWarning } from '../../shared/schemas/structured-page-data.schema';
import { isDisabledElement, isVisibleElement } from './element-finder';
import { resolveRole } from './role-resolver';

export type ElementStateSnapshot = {
  visible: boolean;
  disabled: boolean;
  checked?: boolean | undefined;
  selected?: boolean | undefined;
  warnings: StructuredPageWarning[];
};

export function readElementState(element: Element | null, locale: Locale = 'zh'): ElementStateSnapshot {
  if (!element) {
    return {
      visible: false,
      disabled: false,
      warnings: [
        {
          code: ERROR_CODES.ELEMENT_STATE_UNREADABLE,
          message: t('page.elementState.unreadable', locale)
        }
      ]
    };
  }

  const role = resolveStateRole(element);
  return {
    visible: isVisibleElement(element),
    disabled: isDisabledElement(element),
    checked: readCheckedState(element, role),
    selected: readSelectedState(element, role),
    warnings: []
  };
}

function resolveStateRole(element: Element): string | undefined {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'summary') {
    return 'button';
  }
  if (tagName === 'option') {
    return 'option';
  }
  return element.getAttribute('role')?.trim() || resolveRole(element);
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
