import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChromeContentRpcClient,
  mergeFrameObservationResponses
} from '../../../../src/page/messaging/content-rpc-client';
import type { ContentRpcRequest } from '../../../../src/page/messaging/content-rpc.schema';
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
        get: vi.fn(async () => ({ url: 'https://mail.google.com/mail/u/0/#inbox' })),
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
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      1499184501,
      { type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE },
      { frameId: 0 }
    );
  });

  it('does not dynamically inject into restricted domains', async () => {
    const executeScript = vi.fn(async () => []);
    const sendMessage = vi.fn(async () => ({
      ok: false,
      code: 'CONTENT_SCRIPT_UNAVAILABLE',
      message: 'restricted'
    }));
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript
      },
      tabs: {
        get: vi.fn(async () => ({ url: 'https://secure.bank.example/login' })),
        sendMessage
      },
      webNavigation: {
        getAllFrames: vi.fn(async () => [{ frameId: 0, url: 'https://secure.bank.example/login' }])
      }
    });

    const client = new ChromeContentRpcClient(42);
    await client.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('does not dynamically inject when stored domain policy does not enable the tab domain', async () => {
    const executeScript = vi.fn(async () => []);
    const sendMessage = vi.fn(async () => ({
      ok: false,
      code: 'CONTENT_SCRIPT_UNAVAILABLE',
      message: 'not enabled'
    }));
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            browserHelmDomainPolicy: {
              enabledDomains: ['allowed.example']
            }
          }))
        }
      },
      tabs: {
        get: vi.fn(async () => ({ url: 'https://blocked.example/page' })),
        sendMessage
      },
      webNavigation: {
        getAllFrames: vi.fn(async () => [{ frameId: 0, url: 'https://blocked.example/page' }])
      }
    });

    const client = new ChromeContentRpcClient(43);
    await client.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });

    expect(executeScript).not.toHaveBeenCalled();
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
      type: 'BH_IFRAME_TYPE',
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
        type: 'BH_IFRAME_TYPE',
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
      type: 'BH_IFRAME_CLICK',
      frameId: 99,
      refId: 'ref_102'
    });

    expect(response).toMatchObject({
      ok: false,
      code: 'FRAME_NOT_FOUND'
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('routes iframe form authorization and fill messages to the owning frame', async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: ContentRpcRequest) => {
      if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
        return {
          ok: true,
          actionToken: 'frame-token'
        };
      }
      return {
        ok: true,
        fillManyResult: {
          ok: true,
          fields: [
            {
              fieldRefId: 'ref_101',
              type: 'text',
              status: 'filled',
              requestedValue: 'Counter',
              actualValuePreview: 'Counter',
              changedPage: true
            }
          ],
          filledCount: 1,
          skippedCount: 0,
          failedCount: 0,
          changedPage: true,
          requiresObserve: true,
          summary: '已填写 1 个字段'
        }
      };
    });
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
            url: 'https://account.apple.com/account'
          },
          {
            frameId: 7,
            url: 'https://appleid.apple.com/widget/account/',
            parentFrameId: 0
          }
        ])
      }
    });

    const client = new ChromeContentRpcClient(42);
    const authorize = await client.request({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: ['frame_7:ref_101'],
      runId: 'run_1',
      stepId: 'step_1'
    });
    const fill = await client.request({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_MANY,
      targets: [
        {
          fieldRefId: 'frame_7:ref_101',
          value: 'Counter'
        }
      ],
      actionToken: 'frame-token',
      runId: 'run_1',
      stepId: 'step_1'
    });

    expect(authorize).toMatchObject({
      ok: true,
      actionToken: 'frame-token'
    });
    expect(fill).toMatchObject({
      ok: true,
      fillManyResult: {
        fields: [
          {
            fieldRefId: 'frame_7:ref_101',
            status: 'filled'
          }
        ]
      }
    });
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      42,
      {
        type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
        action: 'fill',
        fieldRefIds: ['ref_101'],
        formRefId: undefined,
        submitTargetRefId: undefined,
        runId: 'run_1',
        stepId: 'step_1'
      },
      { frameId: 7 }
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      42,
      {
        type: CONTENT_RPC_MESSAGES.FORM_FILL_MANY,
        targets: [
          {
            fieldRefId: 'ref_101',
            value: 'Counter'
          }
        ],
        actionToken: 'frame-token',
        runId: 'run_1',
        stepId: 'step_1'
      },
      { frameId: 7 }
    );
  });

  it('routes iframe enter-submit execute messages by form ref when no submit button ref exists', async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: ContentRpcRequest) => {
      if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
        return {
          ok: true,
          actionToken: 'submit-token'
        };
      }
      return {
        ok: true,
        submitResult: 'submitted'
      };
    });
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
    await client.request({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'submit',
      fieldRefIds: ['frame_7:ref_101'],
      formRefId: 'frame_7:form_1',
      runId: 'run_1',
      stepId: 'step_1'
    });
    const submit = await client.request({
      type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
      formRefId: 'frame_7:form_1',
      actionToken: 'submit-token',
      runId: 'run_1',
      stepId: 'step_1'
    });

    expect(submit).toMatchObject({
      ok: true,
      submitResult: 'submitted'
    });
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      42,
      {
        type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
        action: 'submit',
        fieldRefIds: ['ref_101'],
        formRefId: 'form_1',
        submitTargetRefId: undefined,
        runId: 'run_1',
        stepId: 'step_1'
      },
      { frameId: 7 }
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      42,
      {
        type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
        formRefId: 'form_1',
        submitTargetRefId: undefined,
        actionToken: 'submit-token',
        runId: 'run_1',
        stepId: 'step_1'
      },
      { frameId: 7 }
    );
  });

  it('rejects form actions that mix top-level and iframe refs', async () => {
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
            url: 'https://account.apple.com/account'
          },
          {
            frameId: 7,
            url: 'https://appleid.apple.com/widget/account/',
            parentFrameId: 0
          }
        ])
      }
    });

    const client = new ChromeContentRpcClient(42);
    const response = await client.request({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_MANY,
      targets: [
        {
          fieldRefId: 'ref_100',
          value: 'top'
        },
        {
          fieldRefId: 'frame_7:ref_101',
          value: 'iframe'
        }
      ],
      actionToken: 'frame-token',
      runId: 'run_1',
      stepId: 'step_1'
    });

    expect(response).toMatchObject({
      ok: false,
      code: 'FRAME_REF_MISMATCH'
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
