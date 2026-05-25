// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readValuePreview } from '../../../../src/page/dom/value-preview';

describe('value-preview', () => {
  it('summarizes ordinary text-like field previews without exposing values', () => {
    document.body.innerHTML = `<input id="name" value="abcdefghijklmnopqrstuvwxyz1234567890" />`;

    expect(readValuePreview(field('#name'))).toBe('[MASKED]');
  });

  it('summarizes textarea previews without exposing values', () => {
    document.body.innerHTML = `<textarea id="bio">${'x'.repeat(120)}</textarea>`;

    expect(readValuePreview(field('#bio'))).toBe('non-empty');
  });

  it('returns empty for blank text-like field previews', () => {
    document.body.innerHTML = `<input id="company" value="" />`;

    expect(readValuePreview(field('#company'))).toBe('empty');
  });

  it('uses state preview for checkbox and radio fields', () => {
    document.body.innerHTML = `
      <input id="terms" type="checkbox" checked />
      <input id="plan" type="radio" />
      <select id="city"><option>上海</option><option selected>杭州</option></select>
    `;

    expect(readValuePreview(field('#terms'))).toBe('checked');
    expect(readValuePreview(field('#plan'))).toBe('unchecked');
    expect(readValuePreview(field('#city'))).toBe('[MASKED]');
  });

  it('masks sensitive field previews before exposing the value', () => {
    document.body.innerHTML = `
      <input id="password" type="password" value="super-secret-password" />
      <input id="email" type="email" value="me@example.com" />
    `;

    expect(readValuePreview(field('#password'))).toBe('[MASKED]');
    expect(readValuePreview(field('#email'))).toBe('[MASKED]');
  });
});

function field(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing field: ${selector}`);
  }
  return element;
}
