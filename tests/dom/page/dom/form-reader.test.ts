// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readFormFields } from '../../../../src/page/dom/form-reader';
import { RefMap } from '../../../../src/page/a11y/ref-map';
import { buildObservation } from '../../../../src/page/observe/build-observation';
import { buildStructuredPageData } from '../../../../src/page/structured/structured-page-data';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('form-reader', () => {
  it('reads native forms into field snapshots with submit summary', () => {
    const page = loadDomFixture(
      'v0-32-form-complete.html',
      'https://demo.example.com/form'
    );
    const result = readFormFields(page.document, createRefMap());

    expect(result.status).toBe('ready');
    const email = result.fields.find((field) => field.name === 'email');
    expect(email).toMatchObject({
      label: '邮箱',
      name: 'email',
      type: 'email',
      required: true,
      sensitive: true,
      valuePreview: '[MASKED]'
    });
    expect(email?.submit?.disabled).toBe(false);
    expect(email?.submit?.refId).toMatch(/^ref_/u);
  });

  it('uses field-specific roles and DOM visibility in snapshots', () => {
    document.body.innerHTML = `
      <form>
        <input id="agree" name="agree" type="checkbox" checked />
        <input id="plan" name="plan" type="radio" />
        <input id="volume" name="volume" type="range" />
        <select id="country" name="country"><option selected>中国</option></select>
        <input id="avatar" name="avatar" type="file" style="display:none" />
      </form>
    `;

    const refMap = createRefMap();
    const result = readFormFields(document, refMap);
    const byName = new Map(result.fields.map((field) => [field.name, field]));

    expect(byName.get('agree')).toMatchObject({
      type: 'checkbox',
      valuePreview: 'checked'
    });
    expect(byName.get('plan')).toMatchObject({
      type: 'radio',
      valuePreview: 'unchecked'
    });
    expect(byName.get('volume')?.refId).toMatch(/^ref_/u);
    expect(byName.get('country')?.valuePreview).toBe('non-empty');
    expect(result.fields.map((field) => field.name)).not.toContain('avatar');

    const refSummary = createRefSummary(result, refMap);
    expect(refSummary.get('agree')).toMatchObject({ role: 'checkbox', visible: true });
    expect(refSummary.get('plan')).toMatchObject({ role: 'radio', visible: true });
    expect(refSummary.get('volume')).toMatchObject({ role: 'slider', visible: true });
    expect(refSummary.get('country')).toMatchObject({ role: 'combobox', visible: true });
  });

  it('ignores hidden file inputs that are only used behind upload buttons', () => {
    document.body.innerHTML = `
      <main>
        <button type="button" aria-label="Add photos">Add photos</button>
        <input id="media-upload" type="file" style="display:none" />
      </main>
    `;

    const result = readFormFields(document, createRefMap());

    expect(result).toMatchObject({
      status: 'empty',
      fields: [],
      emptyReason: 'NO_FORM_FIELDS_DETECTED'
    });
  });

  it('returns fields even when there is no form tag', () => {
    const page = loadDomFixture(
      'v0-32-fields-without-form.html',
      'https://demo.example.com/fields'
    );
    const result = readFormFields(page.document, createRefMap());

    expect(result.status).toBe('ready');
    expect(result.fields.map((field) => field.name)).toContain('standaloneEmail');
  });

  it('returns empty status when no form fields exist', () => {
    const page = loadDomFixture(
      'v0-32-no-form.html',
      'https://demo.example.com/no-form'
    );

    expect(readFormFields(page.document, createRefMap())).toMatchObject({
      status: 'empty',
      fields: [],
      emptyReason: 'NO_FORM_FIELDS_DETECTED'
    });
  });

  it('keeps partial snapshots for missing submit and field warnings', () => {
    const page = loadDomFixture(
      'v0-32-invalid-disabled-sensitive.html',
      'https://demo.example.com/form-edge'
    );
    const result = readFormFields(page.document, createRefMap());

    expect(result.status).toBe('partial');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORM_SUBMIT_NOT_FOUND' })
      ])
    );
    expect(result.fields.find((field) => field.name === 'password')).toMatchObject({
      sensitive: true,
      valuePreview: '[MASKED]'
    });
    expect(result.fields.find((field) => field.name === 'apiKey')).toMatchObject({
      sensitive: true,
      valuePreview: '[MASKED]'
    });
    expect(result.fields.find((field) => field.name === 'email')?.validation).toMatchObject({
      valid: false,
      ariaInvalid: true
    });
  });

  it('upgrades StructuredPageData forms tab from unsupported to v0.32 snapshots', () => {
    const page = loadDomFixture(
      'v0-32-form-complete.html',
      'https://demo.example.com/form'
    );
    const observation = buildObservation(page.document);

    const structured = buildStructuredPageData(observation, {
      updatedAt: '2026-05-24T05:00:00.000Z'
    });

    expect(structured.forms.status).toBe('ready');
    expect(structured.forms.summary).toContain('字段');
    expect(structured.forms.items[0]).toMatchObject({
      label: '邮箱',
      required: true
    });
  });
});

function createRefMap(): RefMap {
  return new RefMap({
    tabId: 1,
    documentId: 'doc-1',
    origin: 'https://demo.example.com'
  });
}

function createRefSummary(result: ReturnType<typeof readFormFields>, refMap: RefMap) {
  const byRef = new Map(refMap.summary().map((ref) => [ref.refId, ref]));
  return new Map(
    result.fields.map((field) => [field.name, byRef.get(field.refId)])
  );
}
