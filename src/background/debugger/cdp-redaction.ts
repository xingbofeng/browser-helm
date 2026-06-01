import { redactTextForModelContext } from '../../shared/redaction';

const SENSITIVE_HEADER = /authorization|cookie|set-cookie|x-api-key|api-key|token|secret|password/iu;
const SENSITIVE_TEXT_PAIR = /(\b(?:password|passcode|token|secret|api[_-]?key|apikey|otp|code|cvv)\b\s*[=:]\s*)([^&\s,;}"']+)/giu;
const SENSITIVE_JSON_PAIR = /("(?:password|passcode|token|secret|api[_-]?key|apikey|otp|code|cvv)"\s*:\s*")([^"]*)(")/giu;

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
  const redacted = redactTextForModelContext(value)
    .replace(SENSITIVE_JSON_PAIR, '$1[MASKED]$3')
    .replace(SENSITIVE_TEXT_PAIR, '$1[MASKED]');
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}...[truncated]` : redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
