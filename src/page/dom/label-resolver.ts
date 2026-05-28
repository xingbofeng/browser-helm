import { ERROR_CODES } from '../../shared/constants/error-codes';
import type { StructuredPageWarning } from '../../shared/schemas/structured-page-data.schema';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';

export type FieldLabelSource =
  | 'label-for'
  | 'parent-label'
  | 'aria-labelledby'
  | 'aria-label'
  | 'placeholder'
  | 'name'
  | 'id'
  | 'unknown';

export type FieldLabelResult = {
  label?: string | undefined;
  source: FieldLabelSource;
  warnings: StructuredPageWarning[];
};

export function resolveFieldLabel(element: HTMLElement, locale: Locale = 'zh'): FieldLabelResult {
  const candidates: Array<[FieldLabelSource, string | undefined]> = [
    ['label-for', readForLabel(element)],
    ['parent-label', readParentLabel(element)],
    ['aria-labelledby', readAriaLabelledBy(element)],
    ['aria-label', element.getAttribute('aria-label')?.trim()],
    ['placeholder', element.getAttribute('placeholder')?.trim()],
    ['name', element.getAttribute('name')?.trim()],
    ['id', element.getAttribute('id')?.trim()]
  ];

  for (const [source, label] of candidates) {
    if (label) {
      return {
        label,
        source,
        warnings: []
      };
    }
  }

  return {
    label: undefined,
    source: 'unknown',
    warnings: [
      {
        code: ERROR_CODES.FIELD_LABEL_MISSING,
        message: t('dom.field.labelUnresolved', locale)
      }
    ]
  };
}

function readForLabel(element: HTMLElement): string | undefined {
  const id = element.getAttribute('id');
  if (!id) {
    return undefined;
  }
  const label = element.ownerDocument.querySelector(
    `label[for="${escapeCss(id)}"]`
  );
  return label ? cleanLabelText(label, element) : undefined;
}

function readParentLabel(element: HTMLElement): string | undefined {
  const label = element.closest('label');
  return label ? cleanLabelText(label, element) : undefined;
}

function readAriaLabelledBy(element: HTMLElement): string | undefined {
  const labelledBy = element.getAttribute('aria-labelledby')?.trim();
  if (!labelledBy) {
    return undefined;
  }
  const label = labelledBy
    .split(/\s+/u)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim())
    .filter(Boolean)
    .join(' ');
  return label || undefined;
}

function cleanLabelText(label: Element, element: HTMLElement): string | undefined {
  const clone = label.cloneNode(true) as Element;
  const id = element.getAttribute('id');
  if (id) {
    clone.querySelector(`#${escapeCss(id)}`)?.remove();
  } else {
    clone.querySelector(element.tagName.toLowerCase())?.remove();
  }
  const text = (clone.textContent ?? '').replace(/\s+/gu, ' ').trim();
  return text || undefined;
}

function escapeCss(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value;
}
