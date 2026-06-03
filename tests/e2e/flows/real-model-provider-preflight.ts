import type { ProviderConfig } from '../../../src/agent/model/provider-config';

export type RealModelProviderPreflightResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'provider_unavailable' | 'provider_auth_failed' | 'provider_request_failed';
      message: string;
    };

type FetchImpl = typeof fetch;

export async function preflightRealModelProvider(
  config: ProviderConfig,
  fetchImpl: FetchImpl = fetch
): Promise<RealModelProviderPreflightResult> {
  try {
    const response = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false
      })
    });
    if (response.ok) {
      return { ok: true };
    }
    return classifyRealModelProviderError(response.status, await readResponseBody(response));
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_request_failed',
      message: `Provider preflight request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function classifyRealModelProviderError(
  status: number,
  body: unknown
): RealModelProviderPreflightResult {
  const detail = providerErrorDetail(body);
  const message = `Provider preflight failed with status ${status}${detail ? `: ${detail}` : ''}`;
  if (status === 401 || status === 403) {
    return { ok: false, reason: 'provider_auth_failed', message };
  }
  if (
    status === 402 ||
    detail.toLowerCase().includes('quota') ||
    detail.toLowerCase().includes('endpoint is inactive')
  ) {
    return { ok: false, reason: 'provider_unavailable', message };
  }
  return { ok: false, reason: 'provider_request_failed', message };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 300);
  }
}

function providerErrorDetail(body: unknown): string {
  const error = readRecord(body)?.error;
  const errorRecord = readRecord(error);
  return [
    readString(errorRecord?.message),
    readString(errorRecord?.code),
    readString(errorRecord?.type)
  ].filter(Boolean).join(' | ');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/chat/completions`;
}
