// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { isSensitiveField, maskSensitiveValue } from '../../../../src/page/dom/sensitive-field';

describe('sensitive-field', () => {
  it('marks secrets, payment, and identity fields as sensitive', () => {
    document.body.innerHTML = `
      <input id="password" type="password" value="secret" />
      <input id="token" name="accessToken" value="token-value" />
      <input id="secret" aria-label="Client Secret" value="secret-value" />
      <input id="api" name="apiKey" value="sk-test" />
      <input id="otp" autocomplete="one-time-code" value="123456" />
      <input id="card" name="cardNumber" value="4111111111111111" />
      <input id="ssn" name="ssn" value="123-45-6789" />
      <input id="cnid" aria-label="身份证" value="110101199003070011" />
      <input id="bank" placeholder="银行卡号" value="6222000000000000" />
    `;

    for (const id of [
      'password',
      'token',
      'secret',
      'api',
      'otp',
      'card',
      'ssn',
      'cnid',
      'bank'
    ]) {
      expect(isSensitiveField(field(`#${id}`))).toBe(true);
    }
  });

  it('does not mark ordinary fields as sensitive', () => {
    document.body.innerHTML = `
      <input id="company" name="company" value="BrowserHelm" />
      <input id="email" type="email" name="email" value="me@example.com" />
      <input id="phone" name="phone" value="1234567890" />
      <input id="name" autocomplete="name" value="Ada Lovelace" />
      <input id="address" name="shippingAddress" value="1 Main St" />
      <textarea id="note">hello</textarea>
    `;

    expect(isSensitiveField(field('#company'))).toBe(false);
    expect(isSensitiveField(field('#email'))).toBe(false);
    expect(isSensitiveField(field('#phone'))).toBe(false);
    expect(isSensitiveField(field('#name'))).toBe(false);
    expect(isSensitiveField(field('#address'))).toBe(false);
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
