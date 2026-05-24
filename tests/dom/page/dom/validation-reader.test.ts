// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readFieldValidation } from '../../../../src/page/dom/validation-reader';

describe('validation-reader', () => {
  it('reads required and disabled from native and ARIA attributes', () => {
    document.body.innerHTML = `
      <input id="native" required disabled />
      <input id="aria" aria-required="true" aria-disabled="true" />
    `;

    expect(readFieldValidation(field('#native'))).toMatchObject({
      required: true,
      disabled: true
    });
    expect(readFieldValidation(field('#aria'))).toMatchObject({
      required: true,
      disabled: true
    });
  });

  it('reads validation message and invalid validity state', () => {
    document.body.innerHTML = `<input id="email" type="email" required value="not-an-email" />`;

    const result = readFieldValidation(field('#email'));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.message).toBeTruthy();
  });

  it('reads aria-invalid state', () => {
    document.body.innerHTML = `<input id="email" aria-invalid="true" />`;

    expect(readFieldValidation(field('#email')).validation).toMatchObject({
      valid: false,
      ariaInvalid: true
    });
  });
});

function field(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing field: ${selector}`);
  }
  return element;
}
