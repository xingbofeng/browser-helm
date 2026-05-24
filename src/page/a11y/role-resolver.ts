export function resolveRole(element: Element): string | undefined {
  const explicitRole = element.getAttribute('role')?.trim();
  if (explicitRole) {
    return explicitRole;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'button') {
    return 'button';
  }
  if (tagName === 'a' && element.hasAttribute('href')) {
    return 'link';
  }
  if (tagName === 'textarea') {
    return 'textbox';
  }
  if (tagName === 'select') {
    return 'combobox';
  }
  if (tagName === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    if (type === 'button' || type === 'submit' || type === 'reset') {
      return 'button';
    }
    return 'textbox';
  }

  return undefined;
}
