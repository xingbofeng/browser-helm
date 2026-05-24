import { describe, expect, it } from 'vitest';

import { mergeFrameObservationResponses } from '../../../../src/page/messaging/content-rpc-client';

describe('content RPC frame aggregation', () => {
  it('prefixes iframe refs and form fields while keeping top-level page metadata', () => {
    const merged = mergeFrameObservationResponses([
      {
        frameId: 0,
        response: {
          ok: true,
          observation: observation({
            title: '创建你的 Apple 账户',
            refSummary: [
              {
                refId: 'ref_101',
                role: 'link',
                name: 'Apple',
                tagName: 'a',
                visible: true,
                disabled: false
              }
            ],
            formFields: {
              status: 'empty',
              fields: [],
              count: 0,
              warnings: [],
              emptyReason: 'NO_FORM_FIELDS_DETECTED'
            }
          })
        }
      },
      {
        frameId: 7,
        response: {
          ok: true,
          observation: observation({
            url: 'https://appleid.apple.com/widget/account/',
            title: 'AppleID: Create',
            visibleText: '姓氏 名字 邮箱 密码',
            visibleTextSummary: '姓氏 名字 邮箱 密码',
            refSummary: [
              {
                refId: 'ref_101',
                role: 'textbox',
                name: '姓氏',
                tagName: 'input',
                visible: true,
                disabled: false
              }
            ],
            formFields: {
              status: 'ready',
              fields: [
                {
                  refId: 'ref_101',
                  label: '姓氏',
                  name: 'lastName',
                  type: 'text',
                  required: true,
                  disabled: false,
                  sensitive: false,
                  valuePreview: '',
                  validation: { valid: true },
                  submit: {
                    refId: 'ref_200',
                    disabled: false
                  },
                  warnings: []
                }
              ],
              count: 1,
              submit: {
                refId: 'ref_200',
                disabled: false
              },
              warnings: []
            }
          })
        }
      }
    ]);

    expect(merged.ok).toBe(true);
    if (!merged.ok || !('observation' in merged)) {
      throw new Error('expected observation');
    }
    expect(merged.observation.title).toBe('创建你的 Apple 账户');
    expect(merged.observation.visibleTextSummary).toContain('姓氏');
    expect(merged.observation.refSummary.map((ref) => ref.refId)).toEqual([
      'ref_101',
      'frame_7:ref_101'
    ]);
    expect(merged.observation.formFields).toMatchObject({
      status: 'ready',
      count: 1,
      fields: [
        {
          refId: 'frame_7:ref_101',
          submit: {
            refId: 'frame_7:ref_200'
          }
        }
      ],
      submit: {
        refId: 'frame_7:ref_200'
      }
    });
  });

  it('keeps successful frame observations and reports failed frame urls as warnings', () => {
    const merged = mergeFrameObservationResponses([
      {
        frameId: 0,
        url: 'https://account.apple.com/account',
        response: {
          ok: true,
          observation: observation({
            title: '创建你的 Apple 账户',
            refSummary: [
              {
                refId: 'ref_101',
                role: 'link',
                name: 'Apple',
                tagName: 'a',
                visible: true,
                disabled: false
              }
            ]
          })
        }
      },
      {
        frameId: 9,
        url: 'https://appleid.apple.com/widget/account/',
        response: {
          ok: false,
          code: 'CONTENT_SCRIPT_UNAVAILABLE',
          message: 'Could not establish connection. Receiving end does not exist.'
        }
      }
    ]);

    expect(merged.ok).toBe(true);
    if (!merged.ok || !('observation' in merged)) {
      throw new Error('expected observation');
    }
    expect(merged.observation.refSummary).toHaveLength(1);
    expect(merged.observation.warnings).toContain(
      'frame_9 https://appleid.apple.com/widget/account/: CONTENT_SCRIPT_UNAVAILABLE'
    );
  });
});

function observation(overrides: Record<string, unknown>) {
  return {
    url: 'https://account.apple.com/account',
    title: 'Account',
    currentDomain: 'account.apple.com',
    origin: 'https://account.apple.com',
    visibleText: 'top text',
    visibleTextSummary: 'top text',
    pageStateSummary: '页面包含 1 个可交互元素',
    refSummary: [],
    formFields: undefined,
    warnings: [],
    ...overrides
  };
}
