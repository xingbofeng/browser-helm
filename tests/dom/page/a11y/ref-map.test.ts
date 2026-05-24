// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { buildA11ySnapshot } from '../../../../src/page/a11y/a11y-snapshot';
import { RefMap } from '../../../../src/page/a11y/ref-map';
import { resolveRef } from '../../../../src/page/a11y/ref-resolver';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('a11y snapshot and ref map', () => {
  it('serializes common interactive candidates with stable refs', () => {
    const page = loadDomFixture(
      'interactive-elements.html',
      'https://demo.example.com/elements'
    );
    const refMap = new RefMap({
      tabId: 1,
      documentId: 'doc-1',
      origin: 'https://demo.example.com'
    });

    const snapshot = buildA11ySnapshot(page.document, refMap);

    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refId: 'ref_101',
          role: 'button',
          name: '保存',
          tagName: 'button',
          visible: true,
          disabled: false
        }),
        expect.objectContaining({
          role: 'textbox',
          name: '搜索',
          tagName: 'input'
        }),
        expect.objectContaining({
          role: 'link',
          name: '帮助中心',
          tagName: 'a'
        })
      ])
    );
  });

  it('resolves valid refs and reports stale refs after DOM removal', () => {
    const page = loadDomFixture(
      'dynamic-page.html',
      'https://demo.example.com/dynamic'
    );
    const refMap = new RefMap({
      tabId: 1,
      documentId: 'doc-1',
      origin: 'https://demo.example.com'
    });
    const snapshot = buildA11ySnapshot(page.document, refMap);
    const refId = snapshot.elements[0]!.refId;

    const resolved = resolveRef(refMap, refId);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.element.name).toBe('会消失的按钮');
    }

    page.mutate((document) => document.getElementById('remove-me')?.remove());

    expect(resolveRef(refMap, refId)).toMatchObject({
      ok: false,
      code: 'REF_STALE'
    });
  });

  it('preserves checked and selected state when resolving interactive refs', () => {
    const page = loadDomFixture(
      'v0-31-interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const refMap = new RefMap({
      tabId: 1,
      documentId: 'doc-1',
      origin: 'https://demo.example.com'
    });
    const snapshot = buildA11ySnapshot(page.document, refMap);
    const switchRefId = snapshot.elements.find(
      (element) => element.name === '启用同步'
    )?.refId;
    const optionRefId = snapshot.elements.find(
      (element) => element.name === '中国'
    )?.refId;

    const resolvedSwitch = resolveRef(refMap, switchRefId ?? '');
    expect(resolvedSwitch.ok).toBe(true);
    if (resolvedSwitch.ok) {
      expect(resolvedSwitch.element.checked).toBe(true);
    }

    const resolvedOption = resolveRef(refMap, optionRefId ?? '');
    expect(resolvedOption.ok).toBe(true);
    if (resolvedOption.ok) {
      expect(resolvedOption.element.selected).toBe(true);
    }
  });

  it('does not reuse refs across origins', () => {
    const page = loadDomFixture(
      'dynamic-page.html',
      'https://demo.example.com/dynamic'
    );
    const refMap = new RefMap({
      tabId: 1,
      documentId: 'doc-1',
      origin: 'https://demo.example.com'
    });
    const snapshot = buildA11ySnapshot(page.document, refMap);

    refMap.updateScope({
      tabId: 1,
      documentId: 'doc-2',
      origin: 'https://other.example'
    });

    expect(resolveRef(refMap, snapshot.elements[0]!.refId)).toMatchObject({
      ok: false,
      code: 'REF_STALE'
    });
  });
});
