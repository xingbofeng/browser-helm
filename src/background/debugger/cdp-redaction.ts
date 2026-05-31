import { redactTextForModelContext } from '../../shared/redaction';

const SENSITIVE_HEADER = /authorization|cookie|set-cookie|x-api-key|api-key|token|secret|password/iu;

export function redactCdpHeaders(headers: unknown): Record<string, string> {
  if (!isRecord(headers)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER.test(key) ? '[MASKED]' : redactTextForModelContext(String(value))
    ])
  );
}

export function redactCdpUrl(value: string): string {
  try {
    const parsed = new URL(value);
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, '[REDACTED]');
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return redactTextForModelContext(value);
  }
}

export function redactCdpText(value: string, maxChars = 8_000): string {
  const redacted = redactTextForModelContext(value);
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}...[truncated]` : redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
