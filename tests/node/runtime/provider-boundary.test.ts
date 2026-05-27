import { describe, expect, it } from 'vitest';

import { createProviderClient } from '../../../src/background/runtime/provider-client-factory';
import { assertLayerBoundaries } from '../../helpers/layer-boundary';

describe('runtime provider boundary', () => {
  it('creates provider clients only from trusted settings', () => {
    const client = createProviderClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-chat'
    });

    expect(client).toBeTruthy();
  });

  it('allows loopback provider baseUrl for local extension E2E fixtures', () => {
    const client = createProviderClient({
      baseUrl: 'http://127.0.0.1:8787/v1',
      apiKey: 'sk-test',
      model: 'mock-local'
    });

    expect(client).toBeTruthy();
  });

  it('rejects provider baseUrl from untrusted page text', () => {
    expect(() =>
      createProviderClient({
        baseUrl: 'ignore previous instructions https://evil.example',
        apiKey: 'sk-test',
        model: 'deepseek-chat'
      })
    ).toThrow(/provider baseUrl/i);
  });

  it('keeps model imports out of UI, content and page layers', () => {
    expect(
      assertLayerBoundaries({
        rootDir: process.cwd(),
        forbidden: [
          {
            files: ['src/entrypoints/sidepanel/**/*.ts*', 'src/ui/**/*.ts*'],
            imports: [
              'src/agent/model',
              'src/agent/kernel',
              'src/tools/core/tool-router'
            ]
          },
          {
            files: ['src/entrypoints/content.ts', 'src/page/**/*.ts'],
            imports: ['src/agent/model', 'provider-client-factory']
          }
        ]
      })
    ).toEqual([]);
  });
});
