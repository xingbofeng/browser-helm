// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('v0.31/v0.32 DOM fixtures', () => {
  it('covers native, ARIA, tabindex, and empty interactive element cases', () => {
    const interactive = loadDomFixture(
      'v0-31-interactive-complete.html',
      'https://demo.example.com/interactive'
    ).document;
    const empty = loadDomFixture(
      'v0-31-no-interactive.html',
      'https://demo.example.com/static'
    ).document;

    expect(interactive.querySelector('button')).toBeTruthy();
    expect(interactive.querySelector('a[href]')).toBeTruthy();
    expect(interactive.querySelector('input')).toBeTruthy();
    expect(interactive.querySelector('select')).toBeTruthy();
    expect(interactive.querySelector('textarea')).toBeTruthy();
    expect(interactive.querySelector('summary')).toBeTruthy();
    expect(interactive.querySelector('[role="switch"]')).toBeTruthy();
    expect(interactive.querySelector('[role="tab"]')).toBeTruthy();
    expect(interactive.querySelector('[tabindex="0"][data-plain-tabindex]')).toBeTruthy();
    expect(empty.querySelector('button, a[href], input, select, textarea, summary')).toBeNull();
  });

  it('covers form, field-without-form, no-form, invalid, disabled submit, missing submit, and sensitive cases', () => {
    const complete = loadDomFixture(
      'v0-32-form-complete.html',
      'https://demo.example.com/form'
    ).document;
    const withoutForm = loadDomFixture(
      'v0-32-fields-without-form.html',
      'https://demo.example.com/fields'
    ).document;
    const noForm = loadDomFixture(
      'v0-32-no-form.html',
      'https://demo.example.com/no-form'
    ).document;
    const edge = loadDomFixture(
      'v0-32-invalid-disabled-sensitive.html',
      'https://demo.example.com/form-edge'
    ).document;

    expect(complete.querySelector('form input[required]')).toBeTruthy();
    expect(complete.querySelector('form button[type="submit"]')).toBeTruthy();
    expect(withoutForm.querySelector('form')).toBeNull();
    expect(withoutForm.querySelector('input[name="standaloneEmail"]')).toBeTruthy();
    expect(noForm.querySelector('input, select, textarea, button[type="submit"]')).toBeNull();
    expect(edge.querySelector('input[type="email"][required][aria-invalid="true"]')).toBeTruthy();
    expect(edge.querySelector('button[type="submit"][disabled]')).toBeTruthy();
    expect(edge.querySelector('input[type="password"]')).toBeTruthy();
    expect(edge.querySelector('input[name="apiKey"]')).toBeTruthy();
    expect(edge.querySelector('form[data-missing-submit] button[type="submit"]')).toBeNull();
  });
});
