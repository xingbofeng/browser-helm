import { describe, expect, it } from 'vitest';

import { classifyZone, rankInteractiveElements } from '../../../../src/page/a11y/interactive-ranker';
import type { InteractiveElement } from '../../../../src/shared/schemas/structured-page-data.schema';

describe('interactive-ranker', () => {
  it('orders visible and enabled controls before hidden or disabled controls (small set)', () => {
    const ranked = rankInteractiveElements([
      element({ refId: 'ref_disabled', visible: true, disabled: true, domOrder: 1 }),
      element({ refId: 'ref_hidden', visible: false, disabled: false, domOrder: 0 }),
      element({ refId: 'ref_ready', visible: true, disabled: false, domOrder: 2 })
    ]);

    expect(ranked.map((item) => item.refId)).toEqual([
      'ref_ready',
      'ref_disabled',
      'ref_hidden'
    ]);
  });

  it('uses DOM order as the deterministic final tie breaker (small set)', () => {
    const ranked = rankInteractiveElements([
      element({ refId: 'ref_later', domOrder: 9 }),
      element({ refId: 'ref_earlier', domOrder: 2 })
    ]);

    expect(ranked.map((item) => item.refId)).toEqual(['ref_earlier', 'ref_later']);
  });

  it('does not mutate the original element list', () => {
    const input = [
      element({ refId: 'ref_later', domOrder: 9 }),
      element({ refId: 'ref_earlier', domOrder: 2 })
    ];

    rankInteractiveElements(input);

    expect(input.map((item) => item.refId)).toEqual(['ref_later', 'ref_earlier']);
  });

  it('interleaves elements from different zones for diversity', () => {
    const elements = [
      element({ refId: 'nav_a', role: 'link', domOrder: 1 }),
      element({ refId: 'nav_b', role: 'link', domOrder: 2 }),
      element({ refId: 'form_a', tagName: 'input', domOrder: 3 }),
      element({ refId: 'form_b', tagName: 'input', domOrder: 4 }),
      element({ refId: 'content_a', role: 'button', domOrder: 5 }),
      element({ refId: 'content_b', role: 'button', domOrder: 6 })
    ];

    const ranked = rankInteractiveElements(elements);

    expect(ranked.map((item) => item.refId)).toEqual([
      'nav_a', 'form_a', 'content_a', 'nav_b', 'form_b', 'content_b'
    ]);
  });
});

describe('classifyZone', () => {
  it('classifies links as nav', () => {
    expect(classifyZone(element({ refId: 'a', role: 'link' }))).toBe('nav');
  });

  it('uses captured page zone before role fallbacks', () => {
    expect(classifyZone(element({ refId: 'a', role: 'link', pageZone: 'content' }))).toBe('content');
  });

  it('classifies inputs as form', () => {
    expect(classifyZone(element({ refId: 'a', tagName: 'input' }))).toBe('form');
  });

  it('classifies textareas as form', () => {
    expect(classifyZone(element({ refId: 'a', tagName: 'textarea' }))).toBe('form');
  });

  it('classifies selects as form', () => {
    expect(classifyZone(element({ refId: 'a', tagName: 'select' }))).toBe('form');
  });

  it('classifies submit-like buttons as form', () => {
    expect(classifyZone(element({ refId: 'a', role: 'button', name: '提交' }))).toBe('form');
  });

  it('classifies regular buttons as content', () => {
    expect(classifyZone(element({ refId: 'a', role: 'button', name: '更多' }))).toBe('content');
  });
});

function element(
  overrides: Partial<InteractiveElement> & Pick<InteractiveElement, 'refId'>
): InteractiveElement {
  return {
    refId: overrides.refId,
    role: overrides.role ?? 'button',
    name: overrides.name ?? overrides.refId,
    tagName: overrides.tagName ?? 'button',
    visible: overrides.visible ?? true,
    disabled: overrides.disabled ?? false,
    checked: overrides.checked,
    selected: overrides.selected,
    domOrder: overrides.domOrder,
    pageZone: overrides.pageZone,
    warnings: overrides.warnings ?? []
  };
}
