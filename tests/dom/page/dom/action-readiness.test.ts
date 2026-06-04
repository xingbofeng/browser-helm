// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { buildA11ySnapshot } from '../../../../src/page/a11y/a11y-snapshot';
import { RefMap } from '../../../../src/page/a11y/ref-map';
import { checkActionReadiness } from '../../../../src/page/dom/action-readiness';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('action-readiness', () => {
  it('allows a click action for a visible enabled target', () => {
    const { refMap, refId } = createRefForElement('button');

    expect(checkActionReadiness(refMap, { kind: 'click', refId, source: 'agent' }))
      .toMatchObject({
        canAct: true,
        code: 'OK',
        risk: 'medium',
        staleRefs: false,
        changedPage: false,
        requiresObserve: false,
        wouldRequireApproval: false,
        target: {
          refId,
          visible: true,
          disabled: false
        }
      });
  });

  it('requires observe when the ref is stale', () => {
    const { page, refMap, refId } = createRefForElement('#remove-me');
    page.mutate((document) => document.getElementById('remove-me')?.remove());

    expect(checkActionReadiness(refMap, { kind: 'click', refId, source: 'agent' }))
      .toMatchObject({
        canAct: false,
        code: 'REF_STALE',
        staleRefs: true,
        requiresObserve: true
      });
  });

  it('blocks hidden targets', () => {
    document.body.innerHTML = '<button hidden>隐藏</button>';
    const refMap = createRefMap();
    const snapshot = buildA11ySnapshot(document, refMap);

    expect(
      checkActionReadiness(refMap, {
        kind: 'click',
        refId: snapshot.elements[0]!.refId,
        source: 'agent'
      })
    ).toMatchObject({
      canAct: false,
      code: 'ELEMENT_NOT_ACTIONABLE',
      requiresObserve: false
    });
  });

  it('blocks disabled targets', () => {
    const { refMap, refId } = createRefForElement('button[disabled]');

    expect(checkActionReadiness(refMap, { kind: 'click', refId, source: 'agent' }))
      .toMatchObject({
        canAct: false,
        code: 'ELEMENT_DISABLED',
        requiresObserve: false
      });
  });

  it('blocks type actions for non-text targets', () => {
    const { refMap, refId } = createRefForElement('button');

    expect(
      checkActionReadiness(refMap, {
        kind: 'type',
        refId,
        source: 'agent',
        valuePreview: {
          masked: false,
          preview: 'hello'
        }
      })
    ).toMatchObject({
      canAct: false,
      code: 'ACTION_TARGET_MISMATCH',
      requiresObserve: false
    });
  });

  it('predicts approval for submit action without executing it', () => {
    document.body.innerHTML = '<button type="submit">提交订单</button>';
    const { refMap, refId } = createRefFromCurrentDocument('button');

    expect(checkActionReadiness(refMap, { kind: 'submit', refId, source: 'agent' }))
      .toMatchObject({
        canAct: true,
        risk: 'high',
        wouldRequireApproval: true,
        requiresObserve: false,
        nextHints: ['Request approval before executing this action']
      });
  });

  it('upgrades delete-like click targets to high-risk approval prediction', () => {
    document.body.innerHTML = '<button>删除账号</button>';
    const { refMap, refId } = createRefFromCurrentDocument('button');

    expect(checkActionReadiness(refMap, { kind: 'click', refId, source: 'agent' }))
      .toMatchObject({
        canAct: true,
        risk: 'high',
        wouldRequireApproval: true
      });
  });

  it.each([
    'Authorize payment',
    'Approve transfer',
    'Confirm subscription',
    '同意服务条款'
  ])('upgrades consent-like click target "%s" to high-risk approval prediction', (label) => {
    document.body.innerHTML = `<button>${label}</button>`;
    const { refMap, refId } = createRefFromCurrentDocument('button');

    expect(checkActionReadiness(refMap, { kind: 'click', refId, source: 'agent' }))
      .toMatchObject({
        canAct: true,
        risk: 'high',
        wouldRequireApproval: true
      });
  });

  it('upgrades sensitive type targets to high-risk approval prediction', () => {
    document.body.innerHTML = '<input type="password" aria-label="密码" />';
    const { refMap, refId } = createRefFromCurrentDocument('input');

    expect(
      checkActionReadiness(refMap, {
        kind: 'type',
        refId,
        source: 'agent',
        valuePreview: {
          masked: true,
          preview: '••••••',
          reason: 'password'
        }
      })
    ).toMatchObject({
      canAct: true,
      risk: 'high',
      wouldRequireApproval: true
    });
  });

  it('uses resolved sensitive field metadata instead of only label regex', () => {
    document.body.innerHTML = '<input type="password" aria-label="Account field" />';
    const { refMap, refId } = createRefFromCurrentDocument('input');

    expect(
      checkActionReadiness(refMap, {
        kind: 'type',
        refId,
        source: 'agent',
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'user supplied masked text'
        }
      })
    ).toMatchObject({
      canAct: true,
      risk: 'high',
      wouldRequireApproval: true,
      target: {
        inputType: 'password',
        isSensitive: true
      }
    });
  });
});

function createRefForElement(selector: string) {
  const page = loadDomFixture(
    selector === '#remove-me'
      ? 'dynamic-page.html'
      : 'interactive-complete.html',
    'https://demo.example.com/interactive'
  );
  const refMap = createRefMap();
  const snapshot = buildA11ySnapshot(page.document, refMap);
  const element = page.document.querySelector(selector);
  const refId = snapshot.elements.find((item) => {
    const entry = refMap.resolve(item.refId);
    return entry?.element === element;
  })?.refId;

  if (!refId) {
    throw new Error(`Missing ref for selector ${selector}`);
  }

  return { page, refMap, refId };
}

function createRefMap(): RefMap {
  return new RefMap({
    tabId: 1,
    documentId: 'doc-1',
    origin: 'https://demo.example.com'
  });
}

function createRefFromCurrentDocument(selector: string) {
  const refMap = createRefMap();
  const snapshot = buildA11ySnapshot(document, refMap);
  const element = document.querySelector(selector);
  const refId = snapshot.elements.find((item) => {
    const entry = refMap.resolve(item.refId);
    return entry?.element === element;
  })?.refId;

  if (!refId) {
    throw new Error(`Missing ref for selector ${selector}`);
  }

  return { refMap, refId };
}
