import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { bhIframeClick } from '../../../../src/tools/frame/bh-iframe-click';
import { bhIframeList } from '../../../../src/tools/frame/bh-iframe-list';
import { bhIframeRead } from '../../../../src/tools/frame/bh-iframe-read';
import { bhIframeType } from '../../../../src/tools/frame/bh-iframe-type';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('iframe tools', () => {
  it('marks iframe readability as unknown until a read is attempted', async () => {
    const tool = bhIframeList(rpcClient(async () => ({
      ok: true,
      frames: [
        { frameId: 0, url: 'https://host.example', isTop: true },
        { frameId: 7, url: 'https://frame.example', parentFrameId: 0, isTop: false }
      ]
    })));

    const result = await tool.execute({}, { runId: 'run_1', stepId: 'step_1', runMode: 'ask' });

    expect(result.data).toMatchObject({
      iframes: [
        {
          iframeId: 'frame_7',
          readable: 'unknown'
        }
      ]
    });
  });

  it('reads iframe target refs and exposes iframe reading in ask/debug/act modes', async () => {
    const rpc = rpcClient(async (message) => {
      expect(message).toMatchObject({
        type: CONTENT_RPC_MESSAGES.IFRAME_READ,
        frameId: 7,
        refId: 'ref_102'
      });
      return {
        ok: true,
        ref: {
          refId: 'ref_102',
          role: 'textbox',
          name: '邮箱',
          tagName: 'input',
          visible: true,
          disabled: false
        }
      };
    });
    const registry = new ToolRegistry();
    registry.register(bhIframeRead(rpc));
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('debug').map((tool) => tool.name)).toContain(
      TOOL_NAMES.IFRAME_READ
    );
    expect(router.listToolContracts('act').map((tool) => tool.name)).toContain(
      TOOL_NAMES.IFRAME_READ
    );
    expect(router.listToolContracts('ask').map((tool) => tool.name)).toContain(
      TOOL_NAMES.IFRAME_READ
    );

    const result = await router.execute(
      {
        tool: TOOL_NAMES.IFRAME_READ,
        args: {
          refId: 'frame_7:ref_102'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: false
    });
    expect(result.data).toMatchObject({
      frameId: 7,
      ref: {
        refId: 'frame_7:ref_102',
        name: '邮箱'
      }
    });
  });

  it('returns requiresObserve when iframe target is unavailable', async () => {
    const tool = bhIframeRead(
      rpcClient(async () => ({
        ok: false,
        code: 'FRAME_NOT_FOUND',
        message: 'Frame not found: 7'
      }))
    );

    const result = await tool.execute(
      { refId: 'frame_7:ref_102' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'FRAME_NOT_FOUND',
      changedPage: false,
      requiresObserve: true
    });
  });

  it('returns a specific error for invalid iframeId instead of throwing', async () => {
    const tool = bhIframeRead(rpcClient(async () => ({
      ok: false,
      code: ERROR_CODES.OBSERVATION_FAILED,
      message: 'unexpected'
    })));

    const result = await tool.execute(
      { iframeId: 'bad', mode: 'visible_text' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'ask' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ID_INVALID,
      requiresObserve: false
    });
  });

  it('clicks iframe targets only after readiness passes', async () => {
    const calls: string[] = [];
    const tool = bhIframeClick(
      rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_READ) {
          return {
            ok: true,
            ref: {
              refId: 'ref_200',
              role: 'button',
              name: '展开',
              tagName: 'button',
              visible: true,
              disabled: false
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE) {
          expect(message).toMatchObject({
            frameId: 7,
            refId: 'ref_200',
            action: 'click'
          });
          return {
            ok: true,
            actionToken: 'dynamic-click-token'
          };
        }
        expect(message).toMatchObject({
          type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
          frameId: 7,
          refId: 'ref_200',
          actionToken: 'dynamic-click-token'
        });
        return {
          ok: true,
          ref: {
            refId: 'ref_200',
            role: 'button',
            name: '展开',
            tagName: 'button',
            visible: true,
            disabled: false
          },
          changedPage: true
        };
      })
    );

    const result = await tool.execute(
      { refId: 'frame_7:ref_200' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(calls).toEqual([
      CONTENT_RPC_MESSAGES.IFRAME_READ,
      CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      CONTENT_RPC_MESSAGES.IFRAME_CLICK
    ]);
    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true,
      requiresObserve: true
    });
  });

  it('does not click when readiness blocks the target', async () => {
    const calls: string[] = [];
    const tool = bhIframeClick(
      rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE) {
          expect(message).toMatchObject({
            frameId: 7,
            refId: 'ref_103',
            action: 'type'
          });
          return {
            ok: true,
            actionToken: 'dynamic-type-token'
          };
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_200',
            role: 'button',
            name: '展开',
            tagName: 'button',
            visible: true,
            disabled: true
          }
        };
      })
    );

    const result = await tool.execute(
      { refId: 'frame_7:ref_200' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(calls).toEqual([CONTENT_RPC_MESSAGES.IFRAME_READ]);
    expect(result).toMatchObject({
      ok: false,
      code: 'ELEMENT_DISABLED',
      changedPage: false,
      requiresObserve: false
    });
  });

  it('returns approval required for high-risk iframe click targets', async () => {
    const tool = bhIframeClick(
      rpcClient(async () => ({
        ok: true,
        ref: {
          refId: 'ref_200',
          role: 'button',
          name: '删除账号',
          tagName: 'button',
          visible: true,
          disabled: false
        }
      }))
    );

    const result = await tool.execute(
      { refId: 'frame_7:ref_200' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      requiresApproval: true,
      changedPage: false,
      requiresObserve: false
    });
  });

  it('types into iframe text targets after readiness passes', async () => {
    const calls: Array<{
      type: string;
      text: string | undefined;
      actionToken: string | undefined;
      preview: unknown;
    }> = [];
    const tool = bhIframeType(
      rpcClient(async (message) => {
        calls.push({
          type: message.type,
          text: 'text' in message ? message.text : undefined,
          actionToken: 'actionToken' in message ? message.actionToken : undefined,
          preview: 'valuePreview' in message ? message.valuePreview : undefined
        });
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_READ) {
          return {
            ok: true,
            ref: {
              refId: 'ref_103',
              role: 'textbox',
              name: '邮箱',
              tagName: 'input',
              visible: true,
              disabled: false
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE) {
          expect(message).toMatchObject({
            frameId: 7,
            refId: 'ref_103',
            action: 'type'
          });
          return {
            ok: true,
            actionToken: 'dynamic-type-token'
          };
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_103',
            role: 'textbox',
            name: '邮箱',
            tagName: 'input',
            visible: true,
            disabled: false
          },
          changedPage: true
        };
      })
    );

    const result = await tool.execute(
      {
        refId: 'frame_7:ref_103',
        text: 'hello@example.com',
        valuePreview: {
          masked: false,
          preview: 'hello@example.com'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(calls.map((call) => call.type)).toEqual([
      CONTENT_RPC_MESSAGES.IFRAME_READ,
      CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      CONTENT_RPC_MESSAGES.IFRAME_TYPE
    ]);
    expect(calls[2]).toMatchObject({
      text: 'hello@example.com',
      actionToken: 'dynamic-type-token',
      preview: {
        masked: false,
        preview: 'hello@example.com'
      }
    });
    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true,
      requiresObserve: true
    });
  });

  it('masks sensitive iframe type previews and requires approval', async () => {
    const tool = bhIframeType(
      rpcClient(async () => ({
        ok: true,
        ref: {
          refId: 'ref_103',
          role: 'textbox',
          name: '密码',
          tagName: 'input',
          visible: true,
          disabled: false
        }
      }))
    );

    const result = await tool.execute(
      {
        refId: 'frame_7:ref_103',
        text: 'super-secret',
        valuePreview: {
          masked: true,
          preview: '••••••',
          reason: 'password'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(result).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      requiresApproval: true,
      changedPage: false,
      requiresObserve: false
    });
  });

  it('requires approval when iframe read metadata marks a text field sensitive', async () => {
    const calls: string[] = [];
    const tool = bhIframeType(
      rpcClient(async (message) => {
        calls.push(message.type);
        return {
          ok: true,
          ref: {
            refId: 'ref_103',
            role: 'textbox',
            name: 'Account field',
            tagName: 'input',
            visible: true,
            disabled: false,
            inputType: 'password',
            isSensitive: true
          }
        };
      })
    );

    const result = await tool.execute(
      {
        refId: 'frame_7:ref_103',
        text: 'super-secret',
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'user supplied masked text'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(calls).toEqual([CONTENT_RPC_MESSAGES.IFRAME_READ]);
    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(result).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      requiresApproval: true
    });
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
  };
}
