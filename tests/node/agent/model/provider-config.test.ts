import { describe, expect, it } from 'vitest';

import {
  parseDotEnvText,
  resolveProviderConfigFromEnv,
  resolveProviderConfigWithDotEnvFallback
} from '../../../../src/agent/model/provider-config';

describe('resolveProviderConfigFromEnv', () => {
  it('returns undefined when required env vars are missing', () => {
    const config = resolveProviderConfigFromEnv({
      OPENAI_BASE_URL: '',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: ''
    });

    expect(config).toBeUndefined();
  });

  it('returns config when all required env vars exist', () => {
    const config = resolveProviderConfigFromEnv({
      OPENAI_BASE_URL: 'https://example.com/v1',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-5-mini'
    });

    expect(config?.baseUrl).toBe('https://example.com/v1');
    expect(config?.apiKey).toBe('sk-test');
    expect(config?.model).toBe('gpt-5-mini');
  });

  it('parses dotenv text entries', () => {
    const parsed = parseDotEnvText(`
OPENAI_BASE_URL=https://example.com/v1
OPENAI_API_KEY=sk-test
OPENAI_MODEL=gpt-5-mini
`);

    expect(parsed.OPENAI_BASE_URL).toBe('https://example.com/v1');
    expect(parsed.OPENAI_API_KEY).toBe('sk-test');
    expect(parsed.OPENAI_MODEL).toBe('gpt-5-mini');
  });

  it('uses dotenv fallback when process env is missing', () => {
    const config = resolveProviderConfigWithDotEnvFallback(
      {
        OPENAI_BASE_URL: '',
        OPENAI_API_KEY: '',
        OPENAI_MODEL: ''
      },
      `
OPENAI_BASE_URL=https://fallback.example.com/v1
OPENAI_API_KEY=sk-fallback
OPENAI_MODEL=gpt-5
`
    );

    expect(config?.baseUrl).toBe('https://fallback.example.com/v1');
    expect(config?.apiKey).toBe('sk-fallback');
    expect(config?.model).toBe('gpt-5');
  });

  it('prefers process env over dotenv fallback', () => {
    const config = resolveProviderConfigWithDotEnvFallback(
      {
        OPENAI_BASE_URL: 'https://env.example.com/v1',
        OPENAI_API_KEY: 'sk-env',
        OPENAI_MODEL: 'gpt-5-mini'
      },
      `
OPENAI_BASE_URL=https://fallback.example.com/v1
OPENAI_API_KEY=sk-fallback
OPENAI_MODEL=gpt-5
`
    );

    expect(config?.baseUrl).toBe('https://env.example.com/v1');
    expect(config?.apiKey).toBe('sk-env');
    expect(config?.model).toBe('gpt-5-mini');
  });
});
