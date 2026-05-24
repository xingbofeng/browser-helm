// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { resolveFieldLabel } from '../../../../src/page/dom/label-resolver';

describe('label-resolver', () => {
  it('uses label[for] before every fallback source', () => {
    const document = html(`
      <span id="aria">ARIA 名称</span>
      <label for="email">显式邮箱</label>
      <input id="email" name="emailName" aria-labelledby="aria" aria-label="ARIA Label" placeholder="邮箱占位" />
    `);

    expect(resolveFieldLabel(field(document, '#email'))).toMatchObject({
      label: '显式邮箱',
      source: 'label-for',
      warnings: []
    });
  });

  it('uses parent label before ARIA and placeholder fallback', () => {
    const document = html(`
      <label>
        父级昵称
        <input id="nickname" aria-label="ARIA 昵称" placeholder="昵称占位" />
      </label>
    `);

    expect(resolveFieldLabel(field(document, '#nickname'))).toMatchObject({
      label: '父级昵称',
      source: 'parent-label'
    });
  });

  it('falls back through aria-labelledby, aria-label, placeholder, name, and id', () => {
    const document = html(`
      <span id="city-label">城市</span>
      <input id="city" aria-labelledby="city-label" />
      <input id="phone" aria-label="电话" />
      <input id="search" placeholder="搜索关键字" />
      <input name="tokenName" />
      <input id="lastFallback" />
    `);

    expect(resolveFieldLabel(field(document, '#city'))).toMatchObject({
      label: '城市',
      source: 'aria-labelledby'
    });
    expect(resolveFieldLabel(field(document, '#phone'))).toMatchObject({
      label: '电话',
      source: 'aria-label'
    });
    expect(resolveFieldLabel(field(document, '#search'))).toMatchObject({
      label: '搜索关键字',
      source: 'placeholder'
    });
    expect(resolveFieldLabel(field(document, '[name="tokenName"]'))).toMatchObject({
      label: 'tokenName',
      source: 'name'
    });
    expect(resolveFieldLabel(field(document, '#lastFallback'))).toMatchObject({
      label: 'lastFallback',
      source: 'id'
    });
  });

  it('keeps a warning when no label can be resolved', () => {
    const document = html('<input />');

    expect(resolveFieldLabel(field(document, 'input'))).toMatchObject({
      label: undefined,
      source: 'unknown',
      warnings: [
        expect.objectContaining({
          code: 'FIELD_LABEL_MISSING'
        })
      ]
    });
  });
});

function html(source: string): Document {
  document.body.innerHTML = source;
  return document;
}

function field(document: Document, selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing fixture field: ${selector}`);
  }
  return element;
}
