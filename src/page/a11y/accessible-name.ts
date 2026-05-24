export function readAccessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = element.getAttribute('aria-labelledby')?.trim();
  if (labelledBy) {
    const owner = element.ownerDocument;
    const labelledText = labelledBy
      .split(/\s+/u)
      .map((id) => owner.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (labelledText) {
      return labelledText;
    }
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const label = findWrappingLabelText(element) ?? findForLabelText(element);
    if (label) {
      return label;
    }
    const placeholder = element.getAttribute('placeholder')?.trim();
    if (placeholder) {
      return placeholder;
    }
  }

  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function findWrappingLabelText(element: Element): string | undefined {
  const label = element.closest('label');
  return label ? cleanLabelText(label, element) : undefined;
}

function findForLabelText(element: Element): string | undefined {
  const id = element.getAttribute('id');
  if (!id) {
    return undefined;
  }
  const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
  return label ? cleanLabelText(label, element) : undefined;
}

function cleanLabelText(label: Element, element: Element): string {
  const clone = label.cloneNode(true) as Element;
  const selector = element.getAttribute('name')
    ? `[name="${CSS.escape(element.getAttribute('name') ?? '')}"]`
    : element.tagName.toLowerCase();
  clone.querySelector(selector)?.remove();
  return (clone.textContent ?? '').replace(/\s+/gu, ' ').trim();
}
