import type {
  FormFieldSnapshot,
  InteractiveElement,
  StructuredPageData
} from '../../shared/schemas/structured-page-data.schema';

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
};

export function mergeElementsAndForms(data: StructuredPageData): ElementsFormsRow[] {
  const rows = new Map<string, ElementsFormsRow>();

  for (const ref of data.refs.items) {
    rows.set(ref.refId, {
      id: ref.refId,
      type: ref.role === 'button' ? 'button' : 'ref',
      label: safeElementLabel(ref.name ?? '-'),
      roleTag: `${ref.role ?? '-'} / ${ref.tagName}`,
      state: stateText(ref.visible, ref.disabled ?? false),
      validation: '-',
      refId: ref.refId,
      visible: ref.visible,
      disabled: ref.disabled ?? false
    });
  }

  for (const element of data.interactive.items) {
    const existing = rows.get(element.refId);
    rows.set(element.refId, {
      ...(existing ?? {
        id: element.refId,
        validation: '-',
        refId: element.refId
      }),
      type: elementType(element),
      label: safeElementLabel(element.name ?? existing?.label ?? '-'),
      roleTag: `${element.role ?? '-'} / ${element.tagName}`,
      state: stateText(element.visible, element.disabled),
      visible: element.visible,
      disabled: element.disabled
    });
  }

  let sensitiveFieldIndex = 0;
  for (const field of data.forms.items) {
    const sensitive = isSensitiveFieldRow(field);
    if (sensitive) {
      sensitiveFieldIndex += 1;
    }
    const rowRefId = sensitive ? sensitiveRefId(sensitiveFieldIndex) : field.refId;
    rows.set(field.refId, {
      ...(rows.get(field.refId) ?? {
        id: rowRefId,
        refId: rowRefId
      }),
      id: rowRefId,
      type: 'form-field',
      label: sensitive ? '敏感字段' : field.label ?? field.name ?? '-',
      roleTag: `input / ${sensitive ? 'sensitive' : field.type}`,
      state: stateText(true, field.disabled),
      validation: sensitive ? sensitiveValidationText(field) : formValidationText(field),
      refId: rowRefId,
      visible: true,
      disabled: field.disabled,
      required: field.required,
      validationMessage: sensitive ? sensitiveValidationText(field) : field.validation.message,
      submitReason: sensitive && field.submit?.reason?.message
        ? '敏感字段阻止提交'
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

function safeElementLabel(label: string): string {
  return isSensitiveText(label) ? '敏感元素' : label;
}

function isSensitiveText(value: string): boolean {
  return sensitiveFieldPattern.test(value);
}

function sensitiveValidationText(field: FormFieldSnapshot): string {
  if (!field.validation.valid) {
    return '敏感字段校验异常';
  }
  if (field.submit?.disabled) {
    return '敏感字段阻止提交';
  }
  return field.required ? '敏感字段必填已通过' : '敏感字段已通过';
}

function elementType(element: InteractiveElement): ElementsFormsRow['type'] {
  return element.role === 'button' || element.tagName.toLowerCase() === 'button'
    ? 'button'
    : 'interactive';
}

function stateText(visible: boolean, disabled: boolean): string {
  const visibility = visible ? '可见' : '隐藏';
  return disabled ? `${visibility} / 禁用` : `${visibility} / 可用`;
}

function formValidationText(field: FormFieldSnapshot): string {
  if (!field.validation.valid) {
    return field.validation.message ?? '校验异常';
  }
  if (field.submit?.disabled) {
    return field.submit.reason?.message ?? '阻止提交';
  }
  return field.required ? '必填已通过' : '通过';
}
