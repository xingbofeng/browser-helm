// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { isSensitiveField, maskSensitiveValue } from '../../../../src/page/dom/sensitive-field';

describe('sensitive-field', () => {
  it('marks password, token, secret, api key, and otp fields as sensitive', () => {
    document.body.innerHTML = `
      <input id="password" type="password" value="secret" />
      <input id="token" name="accessToken" value="token-value" />
      <input id="secret" aria-label="Client Secret" value="secret-value" />
      <input id="api" name="apiKey" value="sk-test" />
      <input id="otp" autocomplete="one-time-code" value="123456" />
    `;

    for (const id of ['password', 'token', 'secret', 'api', 'otp']) {
      expect(isSensitiveField(field(`#${id}`))).toBe(true);
    }
  });

  it('does not mark ordinary fields as sensitive', () => {
    document.body.innerHTML = `
      <input id="email" type="email" name="email" value="me@example.com" />
      <textarea id="note">hello</textarea>
    `;

    expect(isSensitiveField(field('#email'))).toBe(false);
    expect(isSensitiveField(field('#note'))).toBe(false);
  });

  it('masks sensitive previews without exposing the raw value', () => {
    expect(maskSensitiveValue('sk-test-123456')).toBe('[MASKED]');
  });
});

function field(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing field: ${selector}`);
  }
  return element;
}
