// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { findInteractiveElements } from '../../../../src/page/a11y/interactive-filter';
import { RefMap } from '../../../../src/page/a11y/ref-map';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('interactive-filter', () => {
  it('discovers native interactive elements with stable refs', () => {
    const page = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const elements = findInteractiveElements(page.document, createRefMap());

    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'button', name: '保存', tagName: 'button' }),
        expect.objectContaining({ role: 'link', name: '帮助中心', tagName: 'a' }),
        expect.objectContaining({ role: 'textbox', name: '搜索', tagName: 'input' }),
        expect.objectContaining({ role: 'combobox', name: '城市', tagName: 'select' }),
        expect.objectContaining({ role: 'textbox', name: '备注', tagName: 'textarea' }),
        expect.objectContaining({ role: 'button', name: '展开高级选项', tagName: 'summary' })
      ])
    );
    expect(elements.every((element) => element.refId.startsWith('ref_'))).toBe(true);
  });

  it('discovers common ARIA interactive roles with accessible names and state', () => {
    const page = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const elements = findInteractiveElements(page.document, createRefMap());

    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'button', name: '自定义按钮' }),
        expect.objectContaining({ role: 'link', name: '自定义链接' }),
        expect.objectContaining({ role: 'checkbox', name: '订阅通知', checked: true }),
        expect.objectContaining({ role: 'radio', name: '企业版', checked: false }),
        expect.objectContaining({ role: 'switch', name: '启用同步', checked: true }),
        expect.objectContaining({ role: 'textbox', name: '自定义输入' }),
        expect.objectContaining({ role: 'combobox', name: '选择国家' }),
        expect.objectContaining({ role: 'option', name: '中国', selected: true }),
        expect.objectContaining({ role: 'tab', name: '设置', selected: false })
      ])
    );
  });

  it('does not include plain tabindex elements without role, name, or obvious interactive signals', () => {
    const page = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const elements = findInteractiveElements(page.document, createRefMap());

    expect(elements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '只可聚焦的普通容器' })
      ])
    );
  });

  it('does not include hidden inputs as interactive textbox refs', () => {
    document.body.innerHTML = `
      <input type="hidden" name="csrf" value="secret" />
      <input aria-label="可见邮箱" />
    `;

    const elements = findInteractiveElements(document, createRefMap());

    expect(elements).toEqual([
      expect.objectContaining({
        role: 'textbox',
        name: '可见邮箱'
      })
    ]);
  });

  it('returns an empty list when the page has no interactive elements', () => {
    const page = loadDomFixture(
      'interactive-none.html',
      'https://demo.example.com/static'
    );

    expect(findInteractiveElements(page.document, createRefMap())).toEqual([]);
  });
});

function createRefMap(): RefMap {
  return new RefMap({
    tabId: 1,
    documentId: 'doc-1',
    origin: 'https://demo.example.com'
  });
}
