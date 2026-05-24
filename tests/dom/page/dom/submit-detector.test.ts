// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { detectSubmitSummary } from '../../../../src/page/dom/submit-detector';
import { RefMap } from '../../../../src/page/a11y/ref-map';
import type { FormFieldSnapshot } from '../../../../src/shared/schemas/structured-page-data.schema';

describe('submit-detector', () => {
  it('detects native submit buttons inside the form', () => {
    document.body.innerHTML = `
      <form id="signup">
        <input name="email" required />
        <button id="submit" type="submit">提交</button>
      </form>
    `;

    expect(detectSubmitSummary(form('#signup'), [field()], createRefMap())).toMatchObject(
      {
        refId: 'ref_101',
        disabled: false
      }
    );
  });

  it('detects submit buttons associated through the form attribute', () => {
    document.body.innerHTML = `
      <form id="signup"><input name="email" /></form>
      <button id="external" type="submit" form="signup" disabled>提交</button>
    `;

    expect(detectSubmitSummary(form('#signup'), [field()], createRefMap())).toMatchObject({
      refId: 'ref_101',
      disabled: true
    });
  });

  it('returns confirmed disabled reason when a field exposes direct validation evidence', () => {
    document.body.innerHTML = `
      <form id="signup">
        <input name="email" />
        <button type="submit" disabled>提交</button>
      </form>
    `;

    expect(
      detectSubmitSummary(
        form('#signup'),
        [field({ validation: { valid: false, message: '请填写邮箱', ariaInvalid: true } })],
        createRefMap()
      ).reason
    ).toMatchObject({
      kind: 'confirmed',
      message: '请填写邮箱',
      fieldRefId: 'ref_email'
    });
  });

  it('returns inferred disabled reason from invalid or required empty fields', () => {
    document.body.innerHTML = `
      <form id="signup">
        <input name="email" required />
        <button type="submit" disabled>提交</button>
      </form>
    `;

    expect(
      detectSubmitSummary(form('#signup'), [
        field({ required: true, valuePreview: '' })
      ], createRefMap()).reason
    ).toMatchObject({
      kind: 'inferred',
      fieldRefId: 'ref_email'
    });
  });

  it('returns unknown disabled reason when no read-only signal explains it', () => {
    document.body.innerHTML = `
      <form id="signup">
        <input name="email" />
        <button type="submit" disabled>提交</button>
      </form>
    `;

    expect(detectSubmitSummary(form('#signup'), [field()], createRefMap()).reason).toMatchObject(
      {
        kind: 'unknown'
      }
    );
  });
});

function form(selector: string): HTMLFormElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLFormElement)) {
    throw new Error(`Missing form: ${selector}`);
  }
  return element;
}

function field(overrides: Partial<FormFieldSnapshot> = {}): FormFieldSnapshot {
  return {
    refId: 'ref_email',
    label: '邮箱',
    name: 'email',
    type: 'email',
    required: false,
    disabled: false,
    sensitive: false,
    valuePreview: 'me@example.com',
    validation: { valid: true },
    warnings: [],
    ...overrides
  };
}

function createRefMap(): RefMap {
  return new RefMap({
    documentId: 'doc-1',
    origin: 'https://demo.example.com'
  });
}
