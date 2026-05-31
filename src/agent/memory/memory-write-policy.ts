import { redactTextForModelContext, sanitizeSensitiveDetail } from '../../shared/redaction';

const sensitiveAssignmentPattern =
  /\b(password|passcode|token|secret|api[_\s-]?key|otp|one[-\s]?time code|verification code|cvv|card number)\b\s*[:=]\s*([^\s,;]+)/giu;
const zhSensitiveAssignmentPattern =
  /\b(密码|口令|令牌|密钥|验证码|一次性验证码|银行卡|身份证)\b\s*[:：=]\s*([^\s,;，。]+)/gu;
const paymentCardPattern = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/gu;
const chineseCitizenIdPattern = /(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/gu;

export type MemoryWritePolicyResult = {
  value: string;
  masked: boolean;
};

export function sanitizeMemoryText(value: string): MemoryWritePolicyResult {
  const categorized = value
    .replace(chineseCitizenIdPattern, '[REDACTED_ID]')
    .replace(paymentCardPattern, '[REDACTED_CARD]');
  const redacted = redactTextForModelContext(categorized)
    .replace(sensitiveAssignmentPattern, (_match, label: string) => `${label}: [MASKED]`)
    .replace(zhSensitiveAssignmentPattern, (_match, label: string) => `${label}：[MASKED]`);

  return {
    value: redacted,
    masked: redacted !== value
  };
}

export function sanitizeMemoryDetail(value: unknown): unknown {
  return sanitizeSensitiveDetail(value);
}
