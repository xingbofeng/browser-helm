import { isSensitiveField, maskSensitiveValue } from './sensitive-field';

export function readValuePreview(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      return element.checked ? 'checked' : 'unchecked';
    }
    if (isSensitiveField(element)) {
      return maskSensitiveValue(readRawValue(element));
    }
    return presencePreview(element.value);
  }

  if (isSensitiveField(element)) {
    return maskSensitiveValue(readRawValue(element));
  }

  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return presencePreview(readRawValue(element));
  }

  return '';
}

function readRawValue(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return '';
}

function presencePreview(value: string): string {
  return value.trim() ? 'non-empty' : 'empty';
}
