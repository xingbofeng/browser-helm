import { OpenAICompatibleClient } from '../../agent/model/open-ai-compatible-client';
import type { ProviderConfig } from '../../agent/model/provider-config';

export function createProviderClient(config: ProviderConfig): OpenAICompatibleClient {
  validateProviderConfig(config);
  return new OpenAICompatibleClient(config);
}

export function validateProviderConfig(config: ProviderConfig): void {
  if (!config.apiKey.trim() || !config.model.trim()) {
    throw new Error('Provider config is incomplete');
  }

  let parsed: URL;
  try {
    parsed = new URL(config.baseUrl);
  } catch {
    throw new Error('Invalid provider baseUrl');
  }

  if (parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    throw new Error('Invalid provider baseUrl: HTTPS is required');
  }
  if (parsed.protocol !== 'https:' && isLoopbackHost(parsed.hostname) && config.allowLocalProviderEndpoints === false) {
    throw new Error('Invalid provider baseUrl: local provider endpoints are disabled');
  }
  if (/\s/u.test(config.baseUrl)) {
    throw new Error('Invalid provider baseUrl');
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';
}
