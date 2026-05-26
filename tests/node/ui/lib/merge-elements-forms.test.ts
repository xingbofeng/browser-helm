import { describe, expect, it } from 'vitest';

import { mergeElementsAndForms } from '../../../../src/ui/lib/merge-elements-forms';
describe('mergeElementsAndForms', () => {
  it('redacts sensitive field semantics in debug table rows', () => {
    const rows = mergeElementsAndForms({
      observation: tab('ready', []),
      refs: {
        ...tab('ready', []),
        count: 1,
        items: [
          {
            refId: 'ref_captcha_refresh',
            role: 'button',
            name: '新验证码',
            tagName: 'button',
            visible: true,
            disabled: false
          }
        ]
      },
      interactive: {
        ...tab('ready', []),
        count: 1,
        items: [
          {
            refId: 'ref_captcha_refresh',
            role: 'button',
            name: '新验证码',
            tagName: 'button',
            visible: true,
            disabled: false,
            warnings: []
          }
        ]
      },
      forms: {
        ...tab('ready', []),
        count: 2,
        items: [
          {
            refId: 'ref_password',
            label: 'API Key Password',
            name: 'apiKey',
            type: 'password',
            required: true,
            disabled: false,
            sensitive: true,
            valuePreview: '[MASKED]',
            validation: {
              valid: false,
              message: 'api key token is required'
            },
            submit: {
              disabled: true,
              reason: {
                kind: 'inferred',
                message: 'password token missing'
              }
            },
            warnings: []
          },
          {
            refId: 'ref_otp',
            label: 'One-time code',
            name: 'otp',
            type: 'text',
            required: true,
            disabled: false,
            sensitive: false,
            valuePreview: '[MASKED]',
            validation: {
              valid: true
            },
            warnings: []
          }
        ]
      }
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      label: '敏感元素',
      refId: 'ref_captcha_refresh'
    });
    expect(rows[1]).toMatchObject({
      label: '敏感字段',
      roleTag: 'input / sensitive',
      validation: '敏感字段校验异常',
      validationMessage: '敏感字段校验异常',
      submitReason: '敏感字段阻止提交',
      refId: 'sensitive_ref_1'
    });
    expect(rows[2]).toMatchObject({
      label: '敏感字段',
      roleTag: 'input / sensitive',
      refId: 'sensitive_ref_2'
    });
    expect(JSON.stringify(rows)).not.toMatch(/api key|token|password|apiKey/iu);
  });
});

function tab<T>(status: 'ready' | 'empty' | 'unsupported', items: T[]) {
  return {
    status,
    summary: '-',
    count: items.length,
    items,
    updatedAt: '2026-05-26T00:00:00.000Z',
    warnings: []
  };
}
