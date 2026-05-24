import { describe, expect, it } from 'vitest';

import { rankInteractiveElements } from '../../../../src/page/a11y/interactive-ranker';
import type { InteractiveElement } from '../../../../src/shared/schemas/structured-page-data.schema';

describe('interactive-ranker', () => {
  it('orders visible and enabled controls before hidden or disabled controls', () => {
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

  it('uses DOM order as the deterministic final tie breaker', () => {
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
    warnings: overrides.warnings ?? []
  };
}
