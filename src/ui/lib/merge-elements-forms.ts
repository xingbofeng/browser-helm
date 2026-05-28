import type {
  FormFieldSnapshot,
  InteractiveElement,
  StructuredPageData
} from '../../shared/schemas/structured-page-data.schema';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';

const sensitiveFieldPattern = /api.?key|password|passcode|token|secret|otp|one.?time|captcha|verification.?code|图中的字符|验证码|密码|密钥|令牌/u;

export type ElementsFormsRow = {
  id: string;
  type: 'form-field' | 'button' | 'interactive' | 'ref';
  label: string;
  roleTag: string;
  state: string;
  validation: string;
  refId: string;
  visible?: boolean | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  validationMessage?: string | undefined;
  submitReason?: string | undefined;
  /** true when the field/button/interactive has a validation error, submit block, or is sensitive. */
  hasValidationIssue?: boolean | undefined;
};

export function mergeElementsAndForms(data: StructuredPageData, locale: Locale = 'zh'): ElementsFormsRow[] {
  const rows = new Map<string, ElementsFormsRow>();

  for (const ref of data.refs.items) {
    rows.set(ref.refId, {
      id: ref.refId,
      type: ref.role === 'button' ? 'button' : 'ref',
      label: safeElementLabel(ref.name ?? '-', locale),
      roleTag: `${ref.role ?? '-'} / ${ref.tagName}`,
      state: stateText(ref.visible, ref.disabled ?? false, locale),
      validation: '-',
      refId: ref.refId,
      visible: ref.visible,
      disabled: ref.disabled ?? false,
      hasValidationIssue: false
    });
  }

  for (const element of data.interactive.items) {
    const existing = rows.get(element.refId);
    const hasIssue = !element.visible || element.disabled;
    rows.set(element.refId, {
      ...(existing ?? {
        id: element.refId,
        validation: '-',
        refId: element.refId
      }),
      type: elementType(element),
      label: safeElementLabel(element.name ?? existing?.label ?? '-', locale),
      roleTag: `${element.role ?? '-'} / ${element.tagName}`,
      state: stateText(element.visible, element.disabled, locale),
      visible: element.visible,
      disabled: element.disabled,
      hasValidationIssue: existing?.hasValidationIssue ?? hasIssue
    });
  }

  let sensitiveFieldIndex = 0;
  for (const field of data.forms.items) {
    const sensitive = isSensitiveFieldRow(field);
    if (sensitive) {
      sensitiveFieldIndex += 1;
    }
    const rowRefId = sensitive ? sensitiveRefId(sensitiveFieldIndex) : field.refId;
    const hasValidationIssue = sensitive || !field.validation.valid || !!field.submit?.disabled;
    rows.set(field.refId, {
      ...(rows.get(field.refId) ?? {
        id: rowRefId,
        refId: rowRefId
      }),
      id: rowRefId,
      type: 'form-field',
      label: sensitive ? t('elements.sensitiveField', locale) : field.label ?? field.name ?? '-',
      roleTag: `input / ${sensitive ? 'sensitive' : field.type}`,
      state: stateText(true, field.disabled, locale),
      validation: sensitive ? sensitiveValidationText(field, locale) : formValidationText(field, locale),
      refId: rowRefId,
      visible: true,
      disabled: field.disabled,
      required: field.required,
      hasValidationIssue,
      validationMessage: sensitive ? sensitiveValidationText(field, locale) : field.validation.message,
      submitReason: sensitive && field.submit?.reason?.message
        ? t('elements.sensitiveBlockSubmit', locale)
        : field.submit?.reason?.message
    });
  }

  return [...rows.values()];
}

function sensitiveRefId(index: number): string {
  return `sensitive_ref_${index}`;
}

function isSensitiveFieldRow(field: FormFieldSnapshot): boolean {
  return field.sensitive ||
    isSensitiveText([
      field.label,
      field.name,
      field.type,
      field.validation.message,
      field.submit?.reason?.message
    ].filter(Boolean).join(' '));
}

function safeElementLabel(label: string, locale: Locale): string {
  return isSensitiveText(label) ? t('elements.sensitiveElement', locale) : label;
}

function isSensitiveText(value: string): boolean {
  return sensitiveFieldPattern.test(value);
}

function sensitiveValidationText(field: FormFieldSnapshot, locale: Locale): string {
  if (!field.validation.valid) {
    return t('elements.sensitiveValidationError', locale);
  }
  if (field.submit?.disabled) {
    return t('elements.sensitiveBlockSubmit', locale);
  }
  return field.required ? t('elements.sensitivePassedRequired', locale) : t('elements.sensitivePassed', locale);
}

function elementType(element: InteractiveElement): ElementsFormsRow['type'] {
  return element.role === 'button' || element.tagName.toLowerCase() === 'button'
    ? 'button'
    : 'interactive';
}

function stateText(visible: boolean, disabled: boolean, locale: Locale): string {
  const visibility = visible ? t('elements.visible', locale) : t('elements.hidden', locale);
  const state = disabled ? t('elements.disabled', locale) : t('elements.enabled', locale);
  return t('elements.stateText', locale, { visibility, state });
}

function formValidationText(field: FormFieldSnapshot, locale: Locale): string {
  if (!field.validation.valid) {
    return field.validation.message ?? t('elements.validationError', locale);
  }
  if (field.submit?.disabled) {
    return field.submit.reason?.message ?? t('elements.blockSubmit', locale);
  }
  return field.required ? t('elements.requiredPassed', locale) : t('elements.passed', locale);
}
