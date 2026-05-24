import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChromeContentRpcClient,
  mergeFrameObservationResponses
} from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('content RPC frame aggregation', () => {
  it('injects the content script before messaging existing tabs', async () => {
    const executeScript = vi.fn(async () => []);
    const sendMessage = vi.fn(async () => ({
      ok: true,
      observation: observation({
        title: 'Gmail',
        currentDomain: 'mail.google.com'
      })
    }));
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript
      },
      tabs: {
        sendMessage
      },
      webNavigation: {
        getAllFrames: vi.fn(async () => [
          {
            frameId: 0,
            url: 'https://mail.google.com/mail/u/0/#inbox'
          }
        ])
      }
    });

    const client = new ChromeContentRpcClient(1499184501);
    const response = await client.request({
      type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE
    });

    expect(response.ok).toBe(true);
    expect(executeScript).toHaveBeenCalledWith({
      target: {
        tabId: 1499184501,
        allFrames: true
      },
      files: ['content-scripts/content.js']
    });
    expect(sendMessage).toHaveBeenCalledWith(
      1499184501,
      { type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE },
      { frameId: 0 }
    );
  });

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

  it('routes iframe action messages to the requested frame', async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      ref: {
        refId: 'ref_102',
        role: 'textbox',
        name: '邮箱',
        tagName: 'input',
        visible: true,
        disabled: false
      },
      changedPage: true
    }));
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: vi.fn(async () => [])
      },
      tabs: {
        sendMessage
      },
      webNavigation: {
        getAllFrames: vi.fn(async () => [
          {
            frameId: 0,
            url: 'https://account.example.com'
          },
          {
            frameId: 7,
            url: 'https://frame.example.com/form',
            parentFrameId: 0
          }
        ])
      }
    });

    const client = new ChromeContentRpcClient(42);
    const response = await client.request({
      type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
      frameId: 7,
      refId: 'ref_102',
      text: 'hello@example.com',
      valuePreview: {
        masked: false,
        preview: 'hello@example.com'
      }
    });

    expect(response).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 7,
        refId: 'ref_102',
        text: 'hello@example.com',
        valuePreview: {
          masked: false,
          preview: 'hello@example.com'
        }
      },
      { frameId: 7 }
    );
  });

  it('returns a structured error when requested iframe is not listed', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: vi.fn(async () => [])
      },
      tabs: {
        sendMessage
      },
      webNavigation: {
        getAllFrames: vi.fn(async () => [
          {
            frameId: 0,
            url: 'https://account.example.com'
          }
        ])
      }
    });

    const client = new ChromeContentRpcClient(42);
    const response = await client.request({
      type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
      frameId: 99,
      refId: 'ref_102'
    });

    expect(response).toMatchObject({
      ok: false,
      code: 'FRAME_NOT_FOUND'
    });
    expect(sendMessage).not.toHaveBeenCalled();
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
