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
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, text);
  } else {
    element.value = text;
  }
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
  if (element.checked !== desiredState) {
    const label = Array.from(element.labels ?? []).find((candidate): candidate is HTMLLabelElement =>
      isVisibleElement(candidate)
    );
    try {
      (label ?? element).click();
    } catch {
      // Fall back to property assignment below for non-clickable controls.
    }
  }
  if (element.checked !== desiredState) {
    setNativeChecked(element, desiredState);
  }
  syncReactCheckboxTracker(element, desiredState);
  dispatchInputEvents(element);
}

function setNativeChecked(element: HTMLInputElement, desiredState: boolean): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    element.ownerDocument.defaultView?.HTMLInputElement.prototype ?? HTMLInputElement.prototype,
    'checked'
  );
  descriptor?.set?.call(element, desiredState);
  if (descriptor?.set === undefined) {
    element.checked = desiredState;
  }
  syncReactCheckboxTracker(element, desiredState);
}

function syncReactCheckboxTracker(element: HTMLInputElement, desiredState: boolean): void {
  const tracker = (element as unknown as {
    _valueTracker?: { setValue: (value: string) => void };
  })._valueTracker;
  tracker?.setValue(desiredState ? 'false' : 'true');
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
  const resolvedElement = entry && !refMap.isEntryStale(entry)
    ? entry.element
    : target.allowSingleFieldFallback === true
      ? resolveOnlyVisibleFillField(document)
      : undefined;
  if (!resolvedElement) {
    return {
      fieldRefId: target.fieldRefId,
      type: 'unknown',
      status: 'failed',
      error: t('page.formFill.error.refStale', locale),
    };
  }

  const el = resolvedElement;
  if (!(el instanceof HTMLElement)) {
    return {
      fieldRefId: target.fieldRefId,
      type: 'unknown',
      status: 'failed',
      error: t('page.formFill.error.notHTMLElement', locale),
    };
  }

  const label = resolveFieldLabel(el, locale);
  const validation = readFieldValidation(el, locale);
  const fieldType = elementType(el);
  const fieldLabel = label.label || undefined;

  // guard checks
  if (validation.disabled) {
    return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.disabled', locale));
  }
  if (isSensitiveField(el)) {
    return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.sensitive', locale));
  }
  if (!isVisibleElement(el) && !hasVisibleControlLabel(el)) {
    return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.notVisible', locale));
  }
  if (el.getAttribute('readonly') !== null) {
    return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.readonly', locale));
  }

  try {
    if (el instanceof HTMLInputElement) {
      const inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (inputType === 'file') {
        return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.fileUpload', locale));
      }
      if (inputType === 'hidden') {
        return skippedField(target, el, fieldType, fieldLabel, t('formFill.skip.hidden', locale));
      }
      if (inputType === 'checkbox') {
        const want = target.value === 'true' || target.value === 'checked' || target.value === 'on';
        setCheckboxState(el, want);
        return mkField(target, 'filled', el, fieldType, fieldLabel, el.checked ? 'checked' : 'unchecked');
      }
      if (inputType === 'radio') {
        setRadioChecked(el, target.value);
        const checked = document.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`
        );
        return mkField(target, 'filled', el, fieldType, fieldLabel, checked?.value ?? target.value);
      }
      return fillTextControl(target, el, fieldType, fieldLabel);
    }

    if (el instanceof HTMLTextAreaElement) {
      return fillTextControl(target, el, fieldType, fieldLabel);
    }

    if (el instanceof HTMLSelectElement) {
      const ok = setSelectOption(el, target.value);
      return {
        ...mkField(target, ok ? 'filled' : 'failed', el, fieldType, fieldLabel, ok ? el.value : undefined),
        error: ok ? undefined : t('formFill.skip.noMatch', locale, { value: target.value }),
      };
    }

    if (el.getAttribute('contenteditable')?.toLowerCase() === 'true') {
      return fillContentEditable(target, el, fieldType, fieldLabel);
    }

    return mkField(target, 'failed', el, fieldType, fieldLabel, undefined, t('formFill.skip.unsupportedType', locale));
  } catch (err) {
    return mkField(target, 'failed', el, fieldType, fieldLabel, undefined,
      err instanceof Error ? err.message : t('formFill.skip.failed', locale));
  }
}

function skippedField(
  target: FillFieldTarget,
  el: HTMLElement,
  type: string,
  label: string | undefined,
  reason: string
): FillFieldResult {
  return mkField(target, 'skipped', el, type, label, undefined, reason);
}

function fillTextControl(
  target: FillFieldTarget,
  el: HTMLInputElement | HTMLTextAreaElement,
  type: string,
  label: string | undefined
): FillFieldResult {
  const isClearOnly = target.clear === true && target.value.length === 0;
  setFieldText(el, isClearOnly ? '' : target.value);
  return mkField(target, isClearOnly ? 'cleared' : 'filled', el, type, label, el.value);
}

function fillContentEditable(
  target: FillFieldTarget,
  el: HTMLElement,
  type: string,
  label: string | undefined
): FillFieldResult {
  const isClearOnly = target.clear === true && target.value.length === 0;
  setContentEditableText(el, isClearOnly ? '' : target.value);
  return mkField(target, isClearOnly ? 'cleared' : 'filled', el, type, label, el.textContent ?? '');
}

function resolveOnlyVisibleFillField(document: Document): HTMLElement | undefined {
  const standardSearchField = Array.from(
    document.querySelectorAll<HTMLElement>('input[name="search_query"], input[type="search"]')
  ).find(isSafeFallbackFillCandidate);
  if (standardSearchField) {
    return standardSearchField;
  }
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea, [contenteditable="true"]')
  ).filter((element) =>
    (isVisibleElement(element) || hasVisibleControlLabel(element)) &&
    isSafeFallbackFillCandidate(element)
  );
  const searchCandidates = candidates.filter(isSearchLikeField);
  if (searchCandidates.length === 1) {
    return searchCandidates[0];
  }
  if (searchCandidates.length > 1) {
    const [best, second] = searchCandidates
      .map((element) => ({ element, score: searchFallbackScore(element) }))
      .sort((left, right) => right.score - left.score);
    if (best && best.score > 0 && best.score > (second?.score ?? 0)) {
      return best.element;
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function isSafeFallbackFillCandidate(element: HTMLElement): boolean {
  const validation = readFieldValidation(element);
  if (validation.disabled || element.getAttribute('readonly') !== null || isSensitiveField(element)) {
    return false;
  }
  if (element instanceof HTMLInputElement) {
    const inputType = (element.getAttribute('type') ?? 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'number'].includes(inputType);
  }
  return element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable;
}

function isSearchLikeField(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false;
  }
  const haystack = [
    element.getAttribute('type'),
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder')
  ].join(' ').toLowerCase();
  return /search|query|(?:^|\s)q(?:\s|$)|搜索|搜尋/u.test(haystack);
}

function searchFallbackScore(element: HTMLElement): number {
  const fields = {
    type: element instanceof HTMLInputElement ? element.getAttribute('type')?.toLowerCase() ?? '' : '',
    name: element.getAttribute('name')?.toLowerCase() ?? '',
    id: element.getAttribute('id')?.toLowerCase() ?? '',
    ariaLabel: element.getAttribute('aria-label')?.toLowerCase() ?? '',
    placeholder: element.getAttribute('placeholder')?.toLowerCase() ?? ''
  };
  let score = 0;
  if (fields.name === 'search_query') score += 8;
  if (fields.id === 'search') score += 6;
  if (fields.type === 'search') score += 4;
  if (fields.ariaLabel === 'search' || fields.placeholder === 'search') score += 3;
  if (/search|query/u.test(`${fields.name} ${fields.id}`)) score += 2;
  return score;
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
  label?: string,
  actual?: string,
  skipReason?: string,
  error?: string,
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
  const formIdentity = readVerifyFormIdentity(document, fieldMap, submitRefId);

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
        disabledReason = { kind: 'confirmed', message: t('page.formFill.submitDisabled', locale) };
      }
    }
  } else {
    const btn = document.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"]'
    );
    if (btn && isVisibleElement(btn)) {
      submitAvailable = !(btn instanceof HTMLButtonElement && btn.disabled);
      if (!submitAvailable) {
        disabledReason = { kind: 'confirmed', message: t('page.formFill.submitDisabled', locale) };
      }
    }
  }

  const allValid = missingRequired.length === 0 && invalidFields.length === 0 && submitAvailable;
  const status = allValid ? 'pass' : missingRequired.length > 0 || !submitAvailable ? 'fail' : 'warn';

  return {
    status,
    formAction: formIdentity?.action,
    formMethod: formIdentity?.method,
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

function readVerifyFormIdentity(
  document: Document,
  fieldMap: Map<string, HTMLElement>,
  submitRefId?: string
): { action?: string | undefined; method?: string | undefined } | undefined {
  const candidates: HTMLElement[] = [];
  const submit = submitRefId ? fieldMap.get(submitRefId) : undefined;
  if (submit) {
    candidates.push(submit);
  }
  for (const el of fieldMap.values()) {
    candidates.push(el);
  }

  const form = candidates
    .map((el) => el.closest('form'))
    .find((el): el is HTMLFormElement => el instanceof HTMLFormElement)
    ?? document.querySelector<HTMLFormElement>('form');
  if (!form) {
    return undefined;
  }

  const action = form.getAttribute('action')?.trim() || form.action || undefined;
  const method = (form.getAttribute('method')?.trim() || form.method || 'get').toLowerCase();
  return {
    action,
    method
  };
}

// ---------------------------------------------------------------------------
// 提交执行
// ---------------------------------------------------------------------------

export function executeSubmit(
  document: Document,
  refMap: RefMap,
  submitTargetRefId?: string,
  options: {
    allowDisabledSubmit?: boolean;
    formRefId?: string | undefined;
    fieldRefIds?: string[] | undefined;
  } = {}
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

  const submitScope = resolveSubmitScope(document, refMap, options);
  if (!submitScope) {
    return 'no_submit_path';
  }

  // 自动查找 submit button，仅限已批准的表单范围。
  const btn = submitScope.querySelector<HTMLElement>(
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
  if (submitScope instanceof HTMLFormElement) {
    const input = submitScope.querySelector<HTMLElement>(
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

function resolveSubmitScope(
  document: Document,
  refMap: RefMap,
  options: {
    formRefId?: string | undefined;
    fieldRefIds?: string[] | undefined;
  }
): HTMLFormElement | Document | undefined {
  if (options.formRefId) {
    const formEntry = refMap.resolve(options.formRefId);
    const formElement = formEntry?.element;
    if (formElement instanceof HTMLFormElement) {
      return formElement;
    }
    if (formElement instanceof HTMLElement) {
      const closest = formElement.closest('form');
      if (closest instanceof HTMLFormElement) {
        return closest;
      }
    }
  }

  const fieldForm = resolveCommonFieldForm(refMap, options.fieldRefIds ?? []);
  if (fieldForm) {
    return fieldForm;
  }

  return options.formRefId ? undefined : document;
}

function resolveCommonFieldForm(
  refMap: RefMap,
  fieldRefIds: string[]
): HTMLFormElement | undefined {
  let commonForm: HTMLFormElement | undefined;
  for (const refId of fieldRefIds) {
    const entry = refMap.resolve(refId);
    const element = entry?.element;
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const form = element.closest('form');
    if (!(form instanceof HTMLFormElement)) {
      continue;
    }
    if (!commonForm) {
      commonForm = form;
      continue;
    }
    if (commonForm !== form) {
      return undefined;
    }
  }
  return commonForm;
}

// ---------------------------------------------------------------------------
// 提交后观察
// ---------------------------------------------------------------------------

const SUCCESS_PATTERNS =
  /(?:success|成功|thank|感谢|received|已收到|已提交|submitted|完成|确认|confirmation)/i;

export function observeSubmitResult(
  document: Document,
  previousUrl: string,
  locale: Locale = 'zh'
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
    summary = t('page.formFill.submitResult.redirected', locale);
  } else if (urlChanged && visibleErrors.length > 0) {
    outcome = 'unknown';
    summary = t('page.formFill.submitResult.redirectedWithErrors', locale);
  } else if (!urlChanged && visibleErrors.length > 0) {
    outcome = 'failure';
    summary = `提交失败: ${visibleErrors[0]}`;
  } else if (!urlChanged && evidence.formReset) {
    outcome = 'success';
    summary = t('page.formFill.submitResult.formReset', locale);
  } else {
    outcome = 'unknown';
    summary = t('page.formFill.submitResult.noChange', locale);
    evidence.currentFormErrors = [t('page.formFill.submitResult.unknown', locale)];
  }

  return { outcome, evidence, summary };
}
