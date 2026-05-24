import type {
  DisabledSubmitReason,
  FormFieldSnapshot,
  FormSubmitSummary
} from '../../shared/schemas/structured-page-data.schema';
import { readAccessibleName } from '../a11y/accessible-name';
import { isDisabledElement, isVisibleElement } from '../a11y/element-finder';
import type { RefMap } from '../a11y/ref-map';
import { resolveRole } from '../a11y/role-resolver';

export function detectSubmitSummary(
  form: HTMLFormElement,
  fields: FormFieldSnapshot[],
  refMap: RefMap
): FormSubmitSummary {
  const submit = findSubmitButton(form);
  const disabled = submit ? isDisabledElement(submit) : false;
  return {
    disabled,
    ...(submit ? { refId: registerSubmitRef(submit, refMap) } : {}),
    ...(disabled ? { reason: detectDisabledReason(submit, fields) } : {})
  };
}

export function findSubmitButton(form: HTMLFormElement): HTMLElement | undefined {
  const owner = form.ownerDocument;
  const inside = form.querySelector<HTMLElement>(
    'button[type="submit"], input[type="submit"], button:not([type])'
  );
  if (inside) {
    return inside;
  }
  const id = form.getAttribute('id');
  if (!id) {
    return undefined;
  }
  return (
    owner.querySelector<HTMLElement>(
      `button[type="submit"][form="${escapeCss(id)}"], input[type="submit"][form="${escapeCss(id)}"]`
    ) ?? undefined
  );
}

function detectDisabledReason(
  submit: HTMLElement | undefined,
  fields: FormFieldSnapshot[]
): DisabledSubmitReason {
  const validationMessageField = fields.find(
    (field) => typeof field.validation.message === 'string' && field.validation.message.length > 0
  );
  if (validationMessageField?.validation.message) {
    return {
      kind: 'confirmed',
      message: validationMessageField.validation.message,
      fieldRefId: validationMessageField.refId
    };
  }

  const invalidField = fields.find(
    (field) =>
      field.validation.valid === false ||
      field.validation.ariaInvalid ||
      (field.required && field.valuePreview.length === 0)
  );
  if (invalidField) {
    return {
      kind: 'inferred',
      message: '提交按钮禁用，可能与必填、校验错误或禁用字段有关',
      fieldRefId: invalidField.refId
    };
  }

  return {
    kind: 'unknown',
    message: '提交按钮处于禁用状态，但只读页面信号无法判断原因'
  };
}

function registerSubmitRef(submit: HTMLElement, refMap: RefMap): string {
  return refMap.register(submit, {
    role: resolveRole(submit),
    name: readAccessibleName(submit),
    tagName: submit.tagName.toLowerCase(),
    visible: isVisibleElement(submit),
    disabled: isDisabledElement(submit)
  }).refId;
}

function escapeCss(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value;
}
