/**
 * Form Fill DOM Helpers
 *
 * 页面 DOM 层表单填写、验证、合成表单检测、提交执行原语。
 * 这些函数在 content script 上下文中运行，直接操作目标页面 DOM。
 */
import { isSensitiveField } from './sensitive-field';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import { resolveFieldLabel } from './label-resolver';
import { readFieldValidation } from './validation-reader';
import { readWritabilityMeta } from './form-writability';
import { isVisibleElement } from '../a11y/element-finder';
import type { RefMap } from '../a11y/ref-map';
import type { DisabledSubmitReason } from '../../shared/schemas/structured-page-data.schema';
import type {
  FormVerifyResult,
  FieldVerifyResult,
} from '../../shared/schemas/form-fill.schema';
import type {
  FillFieldResult,
  FillFieldTarget,
  FillManyResult,
  SubmitResult
} from './form-fill-types';

export type {
  FillFieldResult,
  FillFieldTarget,
  FillManyResult,
  SubmitResult,
  SyntheticFormGroup
} from './form-fill-types';
export { readWritabilityMeta } from './form-writability';
export { detectSyntheticForm } from './synthetic-form-detector';

// ---------------------------------------------------------------------------
// 字段赋值 helper
// ---------------------------------------------------------------------------

function dispatchInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

export function setFieldText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  element.value = text;
  dispatchInputEvents(element);
}

export function setContentEditableText(
  element: HTMLElement,
  text: string
): void {
  element.textContent = text;
  dispatchInputEvents(element);
}

export function setSelectOption(
  element: HTMLSelectElement,
  desiredValue: string
): boolean {
  const normalizedDesired = normalizeOptionText(desiredValue);
  for (let i = 0; i < element.options.length; i++) {
    const opt = element.options[i];
    if (
      opt &&
      (normalizeOptionText(opt.value) === normalizedDesired ||
        normalizeOptionText(opt.label) === normalizedDesired ||
        normalizeOptionText(opt.textContent ?? '') === normalizedDesired)
    ) {
      element.selectedIndex = i;
      dispatchInputEvents(element);
      return true;
    }
  }
  return false;
}

function normalizeOptionText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function setRadioChecked(
  element: HTMLInputElement,
  desiredValue: string
): void {
  if (element.type !== 'radio') return;
  const matching =
    element.value === desiredValue
      ? element
      : findRadioWithValue(element, desiredValue);
  if (matching) {
    matching.checked = true;
    dispatchInputEvents(matching);
  }
}

export function setCheckboxState(
  element: HTMLInputElement,
  desiredState: boolean
): void {
  if (element.type !== 'checkbox') return;
  element.checked = desiredState;
  dispatchInputEvents(element);
}

function findRadioWithValue(
  source: HTMLInputElement,
  value: string
): HTMLInputElement | null {
  const name = source.name;
  if (!name) return null;
  const form = source.closest('form');
  const root = (form ?? source.ownerDocument) as Document;
  const selector = `input[type="radio"][name="${CSS.escape(name)}"]`;
  const radios = root.querySelectorAll<HTMLInputElement>(selector);
  for (const r of radios) {
    if (r.value === value) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 单字段填写
// ---------------------------------------------------------------------------

export function fillSingleField(
  document: Document,
  refMap: RefMap,
  target: FillFieldTarget,
  locale: Locale = 'zh'
): FillFieldResult {
  const entry = refMap.resolve(target.fieldRefId);
  if (!entry) {
    return {
      fieldRefId: target.fieldRefId,
      type: 'unknown',
      status: 'failed',
      error: 'Ref 已失效',
    };
  }

  const el = entry.element;
  if (!(el instanceof HTMLElement)) {
    return {
      fieldRefId: target.fieldRefId,
      type: 'unknown',
      status: 'failed',
      error: 'Ref 对应的元素不是 HTMLElement',
    };
  }

  const label = resolveFieldLabel(el, locale);
  const validation = readFieldValidation(el, locale);
  const fieldType = elementType(el);

  // guard checks
  if (validation.disabled) {
    return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.disabled', locale));
  }
  if (isSensitiveField(el)) {
    return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.sensitive', locale));
  }
  if (!isVisibleElement(el) && !hasVisibleControlLabel(el)) {
    return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.notVisible', locale));
  }
  if (el.getAttribute('readonly') !== null) {
    return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.readonly', locale));
  }

  try {
    if (el instanceof HTMLInputElement) {
      const inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (inputType === 'file') {
        return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.fileUpload', locale));
      }
      if (inputType === 'hidden') {
        return mkField(target, 'skipped', el, fieldType, label.label || undefined, undefined, t('formFill.skip.hidden', locale));
      }
      if (inputType === 'checkbox') {
        const want = target.value === 'true' || target.value === 'checked' || target.value === 'on';
        setCheckboxState(el, want);
        return mkField(target, 'filled', el, fieldType, label.label || undefined, el.checked ? 'checked' : 'unchecked');
      }
      if (inputType === 'radio') {
        setRadioChecked(el, target.value);
        const checked = document.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`
        );
        return mkField(target, 'filled', el, fieldType, label.label || undefined, checked?.value ?? target.value);
      }
      // generic text-like input
      setFieldText(el, target.clear ? '' : target.value);
      return mkField(target, target.clear ? 'cleared' : 'filled', el, fieldType, label.label || undefined, el.value);
    }

    if (el instanceof HTMLTextAreaElement) {
      setFieldText(el, target.clear ? '' : target.value);
      return mkField(target, target.clear ? 'cleared' : 'filled', el, fieldType, label.label || undefined, el.value);
    }

    if (el instanceof HTMLSelectElement) {
      const ok = setSelectOption(el, target.value);
      return {
        ...mkField(target, ok ? 'filled' : 'failed', el, fieldType, label.label || undefined, ok ? el.value : undefined),
        error: ok ? undefined : t('formFill.skip.noMatch', locale, { value: target.value }),
      };
    }

    if (el.getAttribute('contenteditable')?.toLowerCase() === 'true') {
      setContentEditableText(el, target.clear ? '' : target.value);
      return mkField(target, target.clear ? 'cleared' : 'filled', el, fieldType, label.label || undefined, el.textContent ?? '');
    }

    return mkField(target, 'failed', el, fieldType, label.label || undefined, undefined, t('formFill.skip.unsupportedType', locale));
  } catch (err) {
    return mkField(target, 'failed', el, fieldType, label.label || undefined, undefined,
      err instanceof Error ? err.message : t('formFill.skip.failed', locale));
  }
}

function hasVisibleControlLabel(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const type = (element.getAttribute('type') ?? 'text').toLowerCase();
  if (type !== 'checkbox' && type !== 'radio') {
    return false;
  }
  return Array.from(element.labels ?? []).some((label) => isVisibleElement(label));
}

function mkField(
  target: FillFieldTarget,
  status: FillFieldResult['status'],
  el: HTMLElement,
  type: string,
  label?: string  ,
  actual?: string  ,
  skipReason?: string  ,
  error?: string  ,
): FillFieldResult {
  return {
    fieldRefId: target.fieldRefId,
    label,
    name: el.getAttribute('name')?.trim() || undefined,
    type,
    status,
    actualValuePreview: valuePresence(actual),
    maskedActualValue: actual === undefined ? undefined : '[MASKED]',
    skipReason,
    error,
  };
}

function valuePresence(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'checked' || value === 'unchecked') {
    return value;
  }
  return value.trim() ? 'non-empty' : 'empty';
}

function elementType(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    return el.getAttribute('type')?.toLowerCase() || 'text';
  }
  if (el.getAttribute('contenteditable')?.toLowerCase() === 'true') return 'contenteditable';
  return el.tagName.toLowerCase();
}

// ---------------------------------------------------------------------------
// 批量填写
// ---------------------------------------------------------------------------

export function fillManyFields(
  document: Document,
  refMap: RefMap,
  targets: FillFieldTarget[],
  locale: Locale = 'zh'
): FillManyResult {
  const fields: FillFieldResult[] = [];
  let filled = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of targets) {
    const r = fillSingleField(document, refMap, t, locale);
    fields.push(r);
    if (r.status === 'filled' || r.status === 'cleared') filled++;
    else if (r.status === 'skipped') skipped++;
    else failed++;
  }

  return {
    ok: failed === 0,
    fields,
    filledCount: filled,
    skippedCount: skipped,
    failedCount: failed,
    changedPage: filled > 0,
    requiresObserve: false,
    fallbackAvailable: failed > 0,
    summary:
      failed === 0
        ? t('formFill.summary.success', locale, { filled: String(filled), total: String(targets.length) })
        : t('formFill.summary.partial', locale, { filled: String(filled), skipped: String(skipped), failed: String(failed) }),
  };
}

// ---------------------------------------------------------------------------
// 表单验证
// ---------------------------------------------------------------------------

const ERROR_SELECTORS = [
  '[role="alert"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  '[class*="error"]',
  '[class*="invalid"]',
  '[data-error]',
  '.field-error',
  '.form-error',
  '.invalid-feedback',
];

export function verifyForm(
  document: Document,
  fieldMap: Map<string, HTMLElement>,
  submitRefId?: string,
  locale: Locale = 'zh'
): FormVerifyResult {
  const fieldResults: FieldVerifyResult[] = [];
  const missingRequired: FieldVerifyResult[] = [];
  const invalidFields: FieldVerifyResult[] = [];

  for (const [refId, el] of fieldMap) {
    const label = resolveFieldLabel(el, locale);
    const validation = readFieldValidation(el, locale);
    const writable = readWritabilityMeta(el);

    const filled = writable ? !!writable.actualValue?.trim() : false;
    const isMissing = validation.required && !filled;

    const fr: FieldVerifyResult = {
      fieldRefId: refId,
      label: label.label || undefined,
      name: el.getAttribute('name')?.trim() || undefined,
      valid: validation.validation.valid && !isMissing,
      required: validation.required,
      filled,
      validationMessage: validation.validation.message || undefined,
      ariaInvalid: validation.validation.ariaInvalid,
      actualValuePreview: valuePresence(writable?.actualValue),
      maskedActualValue: writable?.actualValue === undefined ? undefined : '[MASKED]',
    };

    fieldResults.push(fr);
    if (isMissing) missingRequired.push(fr);
    else if (!validation.validation.valid) invalidFields.push(fr);
  }

  // 可见错误文本
  const visibleErrors: string[] = [];
  for (const sel of ERROR_SELECTORS) {
    try {
      const els = document.querySelectorAll(sel);
      for (const e of els) {
        if (e instanceof HTMLElement && isVisibleElement(e)) {
          const t = e.textContent?.trim();
          if (t && t.length > 1 && t.length < 500) visibleErrors.push(t);
        }
      }
    } catch {
      // skip invalid selectors
    }
  }

  // 提交可用性
  let submitAvailable = false;
  let disabledReason: DisabledSubmitReason | undefined;

  if (submitRefId) {
    const resolved = fieldMap.get(submitRefId);
    if (resolved) {
      const btn = resolved as HTMLButtonElement | HTMLInputElement;
      submitAvailable = 'disabled' in btn ? !btn.disabled : true;
      if (!submitAvailable) {
        disabledReason = { kind: 'confirmed', message: '提交按钮已禁用' };
      }
    }
  } else {
    const btn = document.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"]'
    );
    if (btn && isVisibleElement(btn)) {
      submitAvailable = !(btn instanceof HTMLButtonElement && btn.disabled);
      if (!submitAvailable) {
        disabledReason = { kind: 'confirmed', message: '提交按钮已禁用' };
      }
    }
  }

  const allValid = missingRequired.length === 0 && invalidFields.length === 0 && submitAvailable;
  const status = allValid ? 'pass' : missingRequired.length > 0 || !submitAvailable ? 'fail' : 'warn';

  return {
    status,
    allValid,
    missingRequired,
    invalidFields,
    fieldResults,
    disabledSubmitReason: disabledReason,
    visibleErrorText: visibleErrors,
    submitAvailable,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// 提交执行
// ---------------------------------------------------------------------------

export function executeSubmit(
  document: Document,
  refMap: RefMap,
  submitTargetRefId?: string,
  options: { allowDisabledSubmit?: boolean } = {}
): 'submitted' | 'dialog_unsupported' | 'no_submit_path' {
  // 优先使用 ref
  if (submitTargetRefId) {
    const entry = refMap.resolve(submitTargetRefId);
    const el = entry?.element;
    if (el instanceof HTMLElement && isVisibleElement(el)) {
      if (
        (el instanceof HTMLButtonElement && el.disabled) ||
        (el instanceof HTMLInputElement && el.disabled) ||
        el.getAttribute('aria-disabled') === 'true'
      ) {
        if (!options.allowDisabledSubmit) {
          return 'no_submit_path';
        }
      } else {
        el.click();
        return 'submitted';
      }
    }
  }

  // 自动查找 submit button
  const btn = document.querySelector<HTMLElement>(
    'button[type="submit"], input[type="submit"]'
  );
  if (btn && isVisibleElement(btn)) {
    if (
      (btn instanceof HTMLButtonElement && btn.disabled) ||
      (btn instanceof HTMLInputElement && btn.disabled)
    ) {
      if (!options.allowDisabledSubmit) {
        return 'no_submit_path';
      }
    } else {
      btn.click();
      return 'submitted';
    }
  }

  // Enter 回退
  const form = document.querySelector('form');
  if (form) {
    const input = form.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]), textarea, select'
    );
    if (input) {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        })
      );
      return 'submitted';
    }
  }

  return 'no_submit_path';
}

// ---------------------------------------------------------------------------
// 提交后观察
// ---------------------------------------------------------------------------

const SUCCESS_PATTERNS =
  /(?:success|成功|thank|感谢|received|已收到|已提交|submitted|完成|确认|confirmation)/i;

export function observeSubmitResult(
  document: Document,
  previousUrl: string
): SubmitResult {
  const currentUrl = document.location.href;
  const urlChanged = currentUrl !== previousUrl;

  const evidence: SubmitResult['evidence'] = {
    urlChanged,
    urlAfter: currentUrl,
  };

  // 成功信号
  const bodyText = document.body?.textContent ?? '';
  const successTexts: string[] = [];
  if (SUCCESS_PATTERNS.test(bodyText)) {
    const matches = bodyText.match(
      /.{0,40}(?:success|成功|thank|感谢|received|已收到|已提交|submitted|完成|确认|confirmation).{0,40}/gi
    );
    if (matches) successTexts.push(...matches.slice(0, 3).map((m) => m.trim()));
  }
  if (successTexts.length > 0) evidence.successTextDetected = successTexts;

  // toast
  const toasts = document.querySelectorAll(
    '[role="status"], [role="alert"][aria-live="polite"], .toast, .snackbar'
  );
  for (const t of toasts) {
    if (
      t instanceof HTMLElement &&
      isVisibleElement(t) &&
      SUCCESS_PATTERNS.test(t.textContent ?? '')
    ) {
      evidence.successToastDetected = true;
      break;
    }
  }

  // form reset
  const forms = document.querySelectorAll('form');
  for (const f of forms) {
    const inputs = f.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"])'
    );
    const allEmpty = Array.from(inputs).every(
      (i) => i instanceof HTMLInputElement && !i.value
    );
    if (allEmpty && inputs.length > 0) {
      evidence.formReset = true;
      break;
    }
  }

  // 错误信号
  const visibleErrors: string[] = [];
  if (!urlChanged) {
    for (const sel of ERROR_SELECTORS) {
      try {
        const els = document.querySelectorAll(sel);
        for (const e of els) {
          if (e instanceof HTMLElement && isVisibleElement(e)) {
            const t = e.textContent?.trim();
            if (t && t.length > 1 && t.length < 500) visibleErrors.push(t);
          }
        }
      } catch {
        // skip
      }
    }
  }

  if (visibleErrors.length > 0) {
    evidence.visibleErrors = visibleErrors;
    evidence.pageUnchanged = true;
  }

  if (previousUrl === currentUrl && visibleErrors.length === 0) {
    evidence.errorsCleared = true;
  }

  let outcome: SubmitResult['outcome'];
  let summary: string;

  if (urlChanged && visibleErrors.length === 0) {
    outcome = 'success';
    summary = '提交成功，页面已跳转';
  } else if (urlChanged && visibleErrors.length > 0) {
    outcome = 'unknown';
    summary = '提交后跳转但目标页疑似有错误';
  } else if (!urlChanged && visibleErrors.length > 0) {
    outcome = 'failure';
    summary = `提交失败: ${visibleErrors[0]}`;
  } else if (!urlChanged && evidence.formReset) {
    outcome = 'success';
    summary = '提交成功，表单已重置';
  } else {
    outcome = 'unknown';
    summary = '提交后页面无变化，无法判定结果';
    evidence.currentFormErrors = ['无法确定提交结果'];
  }

  return { outcome, evidence, summary };
}
