// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readValuePreview } from '../../../../src/page/dom/value-preview';

describe('value-preview', () => {
  it('limits ordinary text-like field previews to 32 characters', () => {
    document.body.innerHTML = `<input id="name" value="abcdefghijklmnopqrstuvwxyz1234567890" />`;

    expect(readValuePreview(field('#name'))).toHaveLength(32);
  });

  it('limits textarea previews to 80 characters', () => {
    document.body.innerHTML = `<textarea id="bio">${'x'.repeat(120)}</textarea>`;

    expect(readValuePreview(field('#bio'))).toHaveLength(80);
  });

  it('uses state preview for checkbox, radio, and select fields', () => {
    document.body.innerHTML = `
      <input id="terms" type="checkbox" checked />
      <input id="plan" type="radio" />
      <select id="city"><option>上海</option><option selected>杭州</option></select>
    `;

    expect(readValuePreview(field('#terms'))).toBe('checked');
    expect(readValuePreview(field('#plan'))).toBe('unchecked');
    expect(readValuePreview(field('#city'))).toBe('杭州');
  });

  it('masks sensitive field previews before exposing the value', () => {
    document.body.innerHTML = `<input id="password" type="password" value="super-secret-password" />`;

    expect(readValuePreview(field('#password'))).toBe('[MASKED]');
  });
});

function field(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing field: ${selector}`);
  }
  return element;
}
