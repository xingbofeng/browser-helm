const providerSecretPattern = /\bsk-[A-Za-z0-9_-]{8,}/gu;
const sensitiveDetailKeyPattern =
  /api.?key|password|token|secret|otp|one.?time|sensitive.?text/i;

export function maskProviderSecret(value: string): string {
  return value.replace(providerSecretPattern, '[MASKED]');
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
      : maskProviderSecret(value);
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
