// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('DOM fixtures', () => {
  it('covers native, ARIA, tabindex, and empty interactive element cases', () => {
    const interactive = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    ).document;
    const empty = loadDomFixture(
      'interactive-none.html',
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
      'form-complete.html',
      'https://demo.example.com/form'
    ).document;
    const withoutForm = loadDomFixture(
      'fields-without-form.html',
      'https://demo.example.com/fields'
    ).document;
    const noForm = loadDomFixture(
      'form-none.html',
      'https://demo.example.com/no-form'
    ).document;
    const edge = loadDomFixture(
      'form-edge-cases.html',
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
