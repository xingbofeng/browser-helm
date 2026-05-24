import { isSensitiveField, maskSensitiveValue } from './sensitive-field';

export function readValuePreview(element: HTMLElement): string {
  if (isSensitiveField(element)) {
    return maskSensitiveValue(readRawValue(element));
  }

  if (element instanceof HTMLTextAreaElement) {
    return truncate(element.value, 80);
  }

  if (element instanceof HTMLSelectElement) {
    return selectedOptionText(element);
  }

  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      return element.checked ? 'checked' : 'unchecked';
    }
    return truncate(element.value, 32);
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

function selectedOptionText(select: HTMLSelectElement): string {
  const selected = Array.from(select.selectedOptions).map((option) =>
    option.textContent?.trim()
  );
  return selected.filter(Boolean).join(', ');
}

function truncate(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}
