const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;
const API_KEY_PATTERN =
  /(OPENAI_API_KEY\s*=\s*)([A-Za-z0-9._-]+)/gi;

export function maskSecrets(input: string): string {
  return input
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [MASKED]')
    .replace(API_KEY_PATTERN, '$1[MASKED]');
}
