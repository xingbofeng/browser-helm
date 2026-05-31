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

  it('masks screenshot data URLs in persisted tool detail', () => {
    expect(
      sanitizeSensitiveDetail({
        screenshot: {
          dataUrl: 'data:image/png;base64,secret-image-bytes',
          mimeType: 'image/png'
        }
      })
    ).toEqual({
      screenshot: {
        dataUrl: '[MASKED_IMAGE_DATA]',
        mimeType: 'image/png'
      }
    });
  });

  it('masks clipboard text fields in persisted tool detail', () => {
    expect(
      sanitizeSensitiveDetail({
        data: {
          operation: 'read',
          sensitiveText: 'clipboard private value'
        }
      })
    ).toEqual({
      data: {
        operation: 'read',
        sensitiveText: '[MASKED]'
      }
    });
  });

  it('redacts provider base URLs before trace storage', () => {
    expect(redactProviderBaseUrlForTrace('https://internal.example.com/v1')).toBeUndefined();
    expect(redactProviderBaseUrlForTrace(undefined)).toBeUndefined();
  });
});
