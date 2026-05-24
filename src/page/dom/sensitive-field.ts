const SENSITIVE_PATTERNS = [
  /password/iu,
  /token/iu,
  /secret/iu,
  /api\s*key/iu,
  /apikey/iu,
  /otp/iu,
  /one-time-code/iu
];

export function isSensitiveField(element: HTMLElement): boolean {
  const type = element.getAttribute('type')?.trim().toLowerCase();
  if (type === 'password') {
    return true;
  }

  const haystack = [
    type,
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('aria-label'),
    element.getAttribute('autocomplete'),
    element.getAttribute('placeholder')
  ]
    .filter(Boolean)
    .join(' ');

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function maskSensitiveValue(_value: string): string {
  return '[MASKED]';
}
