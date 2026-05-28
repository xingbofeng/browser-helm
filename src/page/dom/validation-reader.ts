import type { FormFieldSnapshot } from '../../shared/schemas/structured-page-data.schema';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';

export type FieldValidationSnapshot = Pick<
  FormFieldSnapshot,
  'required' | 'disabled' | 'validation'
>;

export function readFieldValidation(
  element: HTMLElement,
  locale: Locale = 'zh'
): FieldValidationSnapshot {
  const required =
    element.hasAttribute('required') ||
    element.getAttribute('aria-required') === 'true';
  const disabled =
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true';
  const ariaInvalid = element.getAttribute('aria-invalid') === 'true';
  const validity = readValidity(element);
  const nativeValid = validity?.valid ?? true;
  const message =
    readValidationMessage(element) ??
    (!nativeValid || ariaInvalid ? t('dom.field.validationFailed', locale) : undefined);

  return {
    required,
    disabled,
    validation: {
      valid: !ariaInvalid && nativeValid,
      message,
      ariaInvalid
    }
  };
}

function readValidity(element: HTMLElement): ValidityState | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.validity;
  }
  return undefined;
}

function readValidationMessage(element: HTMLElement): string | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.validationMessage || undefined;
  }
  return undefined;
}
