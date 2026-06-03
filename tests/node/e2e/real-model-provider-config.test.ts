import { describe, expect, it } from 'vitest';

import { resolveRealModelProviderConfig } from '../../e2e/flows/real-model-provider-config';

describe('real model provider config', () => {
  it('allows BROWSER_HELM_REAL_MODEL to override OPENAI_MODEL while reusing fallback base URL and API key', () => {
    expect(resolveRealModelProviderConfig({
      BROWSER_HELM_REAL_MODEL: 'deepseek-v3.2'
    }, [
      'OPENAI_BASE_URL=https://tokenhub.example/v1',
      'OPENAI_API_KEY=sk-test-secret',
      'OPENAI_MODEL=deepseek-v4-pro'
    ].join('\n'))).toEqual({
      baseUrl: 'https://tokenhub.example/v1',
      apiKey: 'sk-test-secret',
      model: 'deepseek-v3.2'
    });
  });
});
