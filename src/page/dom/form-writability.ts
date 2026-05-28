/**
 * Form field writability metadata reader.
 *
 * This module is read-only: it classifies whether a DOM field can safely be
 * written by form-fill tools and records redaction-sensitive value presence.
 */

import { isVisibleElement } from '../a11y/element-finder';
import type { FieldWritabilityMeta } from '../../shared/schemas/structured-page-data.schema';

const HONEYPOT_PATTERNS =
  /(?:hp_|hpot_|hpn_|honey|bait|trap|spam|bot|captcha|hidden_field|hidden_input|secret_field|internal_field|_token$|csrf$|nonce$)/i;

export function readWritabilityMeta(
  element: HTMLElement
): FieldWritabilityMeta | undefined {
  const tagName = element.tagName.toLowerCase();
  const isFormElement =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element.getAttribute('contenteditable')?.toLowerCase() === 'true';

  if (!isFormElement) return undefined;

  const isFileUpload =
    element instanceof HTMLInputElement &&
    element.getAttribute('type') === 'file';
  const isContentEditable =
    element.getAttribute('contenteditable')?.toLowerCase() === 'true';
  const ariaHidden = element.getAttribute('aria-hidden') === 'true';

  const name = element.getAttribute('name')?.trim() ?? '';
  const id = element.id?.trim() ?? '';
  const className = element.className?.toString()?.trim() ?? '';

  let honeypotCandidate = false;
  if (ariaHidden) {
    honeypotCandidate = true;
  } else if (
    HONEYPOT_PATTERNS.test(name) ||
    HONEYPOT_PATTERNS.test(id) ||
    HONEYPOT_PATTERNS.test(className)
  ) {
    honeypotCandidate = true;
  }

  const result: FieldWritabilityMeta = {
    visible: isVisibleElement(element),
    readonly: element.getAttribute('readonly') !== null,
    hidden:
      (element instanceof HTMLInputElement &&
        element.getAttribute('type') === 'hidden') ||
      ariaHidden,
    isFileUpload,
    isContentEditable,
    honeypotCandidate,
    actualTagName: tagName,
  };

  if (element instanceof HTMLInputElement) {
    const t = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (t === 'checkbox' || t === 'radio') {
      result.checked = element.checked;
      result.actualValue = element.checked ? 'true' : 'false';
    } else if (t === 'file') {
      result.actualValue =
        element.files && element.files.length > 0
          ? `${element.files.length} file(s)`
          : '';
    } else {
      result.actualValue = element.value;
    }
  } else if (element instanceof HTMLSelectElement) {
    result.selectedIndex = element.selectedIndex;
    result.actualValue = element.value;
    result.options = Array.from(element.options).map((opt) => ({
      value: opt.value,
      label: opt.label || opt.textContent || opt.value,
      selected: opt.selected,
    }));
  } else if (element instanceof HTMLTextAreaElement) {
    result.actualValue = element.value;
  } else if (isContentEditable) {
    result.actualValue = element.textContent ?? '';
  }

  return result;
}
