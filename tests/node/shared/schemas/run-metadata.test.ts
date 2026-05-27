import { describe, expect, it } from 'vitest';

import { runMetadataSchema } from '../../../../src/shared/schemas/run-metadata.schema';

describe('runMetadataSchema', () => {
  it('accepts required metadata fields', () => {
    const result = runMetadataSchema.parse({
      schemaVersion: '1.0.0',
      promptVersion: '0.1.0',
      toolSchemaVersion: '0.1.0',
      contextPolicyVersion: '0.1.0',
      model: 'gpt-5-mini',
      runMode: 'ask'
    });

    expect(result.schemaVersion).toBe('1.0.0');
    expect(result.model).toBe('gpt-5-mini');
    expect(result.runMode).toBe('ask');
  });

  it('accepts optional provider and capabilities fields', () => {
    const result = runMetadataSchema.parse({
      schemaVersion: '1.0.0',
      promptVersion: '0.1.0',
      toolSchemaVersion: '0.1.0',
      contextPolicyVersion: '0.1.0',
      model: 'gpt-5-mini',
      runMode: 'form',
      providerBaseUrl: 'https://example.com/v1',
      modelCapabilities: {
        supportsStructuredOutput: true,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: false,
        maxContextTokens: 128000
      }
    });

    expect(result.providerBaseUrl).toBe('https://example.com/v1');
    expect(result.runMode).toBe('form');
    expect(result.modelCapabilities?.supportsTools).toBe(true);
  });

  it('rejects empty required fields', () => {
    expect(() =>
      runMetadataSchema.parse({
        schemaVersion: '',
        promptVersion: '0.1.0',
        toolSchemaVersion: '0.1.0',
        contextPolicyVersion: '0.1.0',
        model: 'gpt-5-mini',
        runMode: 'ask'
      })
    ).toThrowError();
  });
});
