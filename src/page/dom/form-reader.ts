import type { RefMap } from '../a11y/ref-map';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { readAccessibleName } from '../a11y/accessible-name';
import { isDisabledElement, isVisibleElement } from '../a11y/element-finder';
import { resolveRole } from '../a11y/role-resolver';
import type {
  FormFieldSnapshot,
  FormSubmitSummary,
  StructuredPageWarning,
  TabDataStatus
} from '../../shared/schemas/structured-page-data.schema';
import { resolveFieldLabel } from './label-resolver';
import { isSensitiveField } from './sensitive-field';
import { detectSubmitSummary, findSubmitButton } from './submit-detector';
import { readValuePreview } from './value-preview';
import { readFieldValidation } from './validation-reader';

export type FormReaderResult = {
  status: Exclude<TabDataStatus, 'unsupported' | 'error'>;
  fields: FormFieldSnapshot[];
  count: number;
  submit?: FormSubmitSummary | undefined;
  warnings: StructuredPageWarning[];
  emptyReason?: string | undefined;
};

const FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea';

export function readFormFields(
  document: Document,
  refMap: RefMap
): FormReaderResult {
  const fieldElements = Array.from(
    document.querySelectorAll<HTMLElement>(FIELD_SELECTOR)
  ).filter(isVisibleElement);
  if (fieldElements.length === 0) {
    return {
      status: 'empty',
      fields: [],
      count: 0,
      warnings: [],
      emptyReason: 'NO_FORM_FIELDS_DETECTED'
    };
  }

  const warnings: StructuredPageWarning[] = [];
  const formByRef = new Map<string, HTMLFormElement | undefined>();
  const fields = fieldElements.map((element, index) => {
    const field = readFieldSnapshot(element, refMap, index);
    const form = element.closest('form');
    formByRef.set(field.refId, form instanceof HTMLFormElement ? form : undefined);
    return field;
  });
  for (const field of fields) {
    warnings.push(...field.warnings.filter(isStructuredWarning));
  }

  const forms = Array.from(document.querySelectorAll('form'));
  const submitByForm = new Map<HTMLFormElement, FormSubmitSummary>();
  for (const form of forms) {
    const formFields = fields.filter((field) => formByRef.get(field.refId) === form);
    const submit = detectSubmitSummary(form, formFields, refMap);
    submitByForm.set(form, submit);
    if (!findSubmitButton(form)) {
      warnings.push({
        code: ERROR_CODES.FORM_SUBMIT_NOT_FOUND,
        message: '字段读取成功，但未找到可关联的 submit button'
      });
    }
  }

  const pageSubmit = forms[0]
    ? submitByForm.get(forms[0])
    : detectPageSubmit(document, refMap);
  const withSubmit = fields.map((field) => ({
    ...field,
    submit: formByRef.get(field.refId)
      ? submitByForm.get(formByRef.get(field.refId)!)
      : pageSubmit
  }));

  return {
    status: warnings.some((warning) => warning.code === ERROR_CODES.FORM_SUBMIT_NOT_FOUND)
      ? 'partial'
      : 'ready',
    fields: withSubmit,
    count: withSubmit.length,
    submit: pageSubmit,
    warnings
  };
}

function readFieldSnapshot(
  element: HTMLElement,
  refMap: RefMap,
  domOrder: number
): FormFieldSnapshot {
  const label = resolveFieldLabel(element);
  const validation = readFieldValidation(element);
  const ref = refMap.register(element, {
    role: fieldRole(element),
    name: label.label,
    tagName: element.tagName.toLowerCase(),
    visible: isVisibleElement(element),
    disabled: validation.disabled
  });

  return {
    refId: ref.refId,
    label: label.label,
    name: element.getAttribute('name')?.trim() || undefined,
    type: fieldType(element),
    required: validation.required,
    disabled: validation.disabled,
    sensitive: isSensitiveField(element),
    valuePreview: readValuePreview(element),
    validation: validation.validation,
    warnings: label.warnings.map((warning) => ({
      ...warning,
      detail: { refId: ref.refId, domOrder }
    }))
  };
}

function fieldRole(element: HTMLElement): string {
  if (element instanceof HTMLSelectElement) {
    return element.multiple || element.size > 1 ? 'listbox' : 'combobox';
  }
  if (element instanceof HTMLTextAreaElement) {
    return 'textbox';
  }
  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    if (type === 'range') {
      return 'slider';
    }
    if (type === 'file') {
      return 'button';
    }
    if (type === 'number') {
      return 'spinbutton';
    }
    if (type === 'search') {
      return 'searchbox';
    }
  }
  return 'textbox';
}

function fieldType(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return element.getAttribute('type')?.toLowerCase() || 'text';
  }
  return element.tagName.toLowerCase();
}

function detectPageSubmit(
  document: Document,
  refMap: RefMap
): FormSubmitSummary | undefined {
  const submit = document.querySelector<HTMLElement>(
    'button[type="submit"], input[type="submit"], button:not([type])'
  );
  if (!submit) {
    return undefined;
  }
  return {
    refId: refMap.register(submit, {
      role: resolveRole(submit),
      name: readAccessibleName(submit),
      tagName: submit.tagName.toLowerCase(),
      visible: isVisibleElement(submit),
      disabled: isDisabledElement(submit)
    }).refId,
    disabled: isDisabledElement(submit)
  };
}

function isStructuredWarning(
  warning: FormFieldSnapshot['warnings'][number]
): warning is StructuredPageWarning {
  return typeof warning === 'object';
}
