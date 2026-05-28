const providerSecretPattern = /\bsk-[A-Za-z0-9_-]{8,}/gu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const phonePattern = /(?<![\w@])(?:\+?\d[\d\s\-()]{6,}\d)(?![\w@])/gu;
const sensitiveDetailKeyPattern =
  /api.?key|password|token|secret|otp|one.?time|sensitive.?text|requested.?value|actual.?value|value.?preview|masked.?actual.?value/i;

export function maskProviderSecret(value: string): string {
  return value.replace(providerSecretPattern, '[MASKED]');
}

export function redactTextForModelContext(value: string): string {
  return maskProviderSecret(value)
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .replace(phonePattern, '[REDACTED_PHONE]');
}

export function redactProviderBaseUrlForTrace(
  _value: string | undefined
): string | undefined {
  return undefined;
}

export function sanitizeSensitiveDetail(value: unknown): unknown {
  return sanitizeDetailValue(value, '');
}

function sanitizeDetailValue(value: unknown, key: string): unknown {
  if (typeof value === 'string') {
    return sensitiveDetailKeyPattern.test(key)
      ? '[MASKED]'
      : redactTextForModelContext(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetailValue(item, key));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeDetailValue(entryValue, entryKey)
    ])
  );
}
