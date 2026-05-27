import { describe, expect, it } from 'vitest';

import {
  actionIntentSchema,
  actionKindLabels,
  actionKindSchema,
  actionReadinessSchema
} from '../../../../src/shared/schemas/action-readiness.schema';
import { toolRiskLabels } from '../../../../src/shared/schemas/tool-result.schema';

describe('action readiness schemas', () => {
  it('accepts a click action intent with a target ref', () => {
    const result = actionIntentSchema.parse({
      kind: 'click',
      refId: 'ref_12',
      source: 'agent'
    });

    expect(result.kind).toBe('click');
    expect(result.refId).toBe('ref_12');
  });

  it('accepts masked preview for type action intent', () => {
    const result = actionIntentSchema.parse({
      kind: 'type',
      refId: 'frame_3:ref_102',
      source: 'tool',
      valuePreview: {
        masked: true,
        preview: '••••••',
        reason: 'password'
      }
    });

    expect(result.valuePreview?.masked).toBe(true);
  });

  it('rejects raw value in type action intent', () => {
    expect(() =>
      actionIntentSchema.parse({
        kind: 'type',
        refId: 'ref_12',
        source: 'agent',
        value: 'secret'
      })
    ).toThrowError();
  });

  it('accepts all action kinds', () => {
    expect(actionKindSchema.options).toEqual([
      'click',
      'type',
      'select',
      'submit',
      'focus'
    ]);
  });

  it('provides bilingual action kind labels', () => {
    expect(actionKindLabels).toEqual({
      click: '点击 / Click',
      type: '输入 / Type',
      select: '选择 / Select',
      submit: '提交 / Submit',
      focus: '聚焦 / Focus'
    });
  });

  it('provides bilingual tool risk labels', () => {
    expect(toolRiskLabels).toEqual({
      safe: '安全 / Safe',
      low: '低风险 / Low',
      medium: '中风险 / Medium',
      high: '高风险 / High'
    });
  });

  it('accepts readiness that requires re-observe for stale refs', () => {
    const result = actionReadinessSchema.parse({
      canAct: false,
      code: 'REF_STALE',
      reason: 'Target ref is stale',
      risk: 'medium',
      staleRefs: true,
      changedPage: false,
      requiresObserve: true,
      wouldRequireApproval: false,
      nextHints: ['Run bh_page_observe again']
    });

    expect(result.requiresObserve).toBe(true);
    expect(result.staleRefs).toBe(true);
  });

  it('accepts approval prediction for high-risk readiness', () => {
    const result = actionReadinessSchema.parse({
      canAct: true,
      code: 'OK',
      reason: 'Submit target is ready but requires approval',
      risk: 'high',
      staleRefs: false,
      changedPage: false,
      requiresObserve: false,
      wouldRequireApproval: true
    });

    expect(result.risk).toBe('high');
    expect(result.wouldRequireApproval).toBe(true);
  });
});
