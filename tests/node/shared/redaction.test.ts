import { describe, expect, it } from 'vitest';

import {
  maskProviderSecret,
  redactProviderBaseUrlForTrace,
  sanitizeSensitiveDetail
} from '../../../src/shared/redaction';

describe('redaction helpers', () => {
  it('masks provider secrets consistently', () => {
    expect(maskProviderSecret('bad key sk-live-secret-token')).toBe(
      'bad key [MASKED]'
    );
  });

  it('does not treat ordinary text fields as secrets', () => {
    expect(
      sanitizeSensitiveDetail({
        textContent: 'Visible label',
        context: 'Login form',
        plaintext: 'not a credential unless the key says it is',
        apiKey: 'sk-live-secret-token'
      })
    ).toEqual({
      textContent: 'Visible label',
      context: 'Login form',
      plaintext: 'not a credential unless the key says it is',
      apiKey: '[MASKED]'
    });
  });

  it('redacts provider base URLs before trace storage', () => {
    expect(redactProviderBaseUrlForTrace('https://internal.example.com/v1')).toBeUndefined();
    expect(redactProviderBaseUrlForTrace(undefined)).toBeUndefined();
  });
});
