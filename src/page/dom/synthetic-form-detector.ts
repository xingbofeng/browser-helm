/**
 * Synthetic form detector for pages that use form-like controls without a
 * native `<form>` element.
 */

import { isVisibleElement } from '../a11y/element-finder';
import type { RefMap } from '../a11y/ref-map';
import { resolveFieldLabel } from './label-resolver';
import type { SyntheticFormGroup } from './form-fill-types';
import type { Locale } from '../../i18n/types';

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), ' +
  'select, textarea, [contenteditable="true"]';

const SUBMIT_LIKE_SELECTOR =
  'button[type="submit"], input[type="submit"], button:not([type])';

export function detectSyntheticForm(
  document: Document,
  refMap: RefMap,
  locale: Locale = 'zh'
): SyntheticFormGroup | undefined {
  const nativeForms = document.querySelectorAll('form');
  if (nativeForms.length > 0) return undefined;

  const fields = document.querySelectorAll<HTMLElement>(FIELD_SELECTOR);
  const visibleFields = Array.from(fields).filter(isVisibleElement);
  if (visibleFields.length === 0) return undefined;

  const fieldRefIds = visibleFields.map((field) => {
    const label = resolveFieldLabel(field, locale);
    return refMap.register(field, {
      role: fieldRole(field),
      name: label.label || undefined,
      tagName: field.tagName.toLowerCase(),
      visible: true,
      disabled: false,
    }).refId;
  });

  const submits = document.querySelectorAll<HTMLElement>(SUBMIT_LIKE_SELECTOR);
  let submitControlRefId: string | undefined;

  for (const submit of submits) {
    if (
      isVisibleElement(submit) &&
      !(submit instanceof HTMLButtonElement && submit.disabled) &&
      !(submit instanceof HTMLInputElement && submit.disabled)
    ) {
      const ref = refMap.register(submit, {
        role: 'button',
        name: submit.textContent?.trim() || 'Submit',
        tagName: submit.tagName.toLowerCase(),
        visible: true,
        disabled: false,
      });
      submitControlRefId = ref.refId;
      break;
    }
  }

  const syntheticFormRef = refMap.register(document.body, {
    role: 'form',
    name: 'synthetic-form',
    tagName: 'body',
    visible: true,
    disabled: false,
  });

  return {
    syntheticFormRefId: syntheticFormRef.refId,
    fieldRefIds,
    submitControlRefId,
    hasNativeForm: false,
  };
}

function fieldRole(element: HTMLElement): string {
  if (element instanceof HTMLSelectElement) return 'combobox';
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
  }
  return 'textbox';
}
