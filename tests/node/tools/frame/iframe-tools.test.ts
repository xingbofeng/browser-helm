import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { bhIframeClick } from '../../../../src/tools/frame/bh-iframe-click';
import { bhIframeRead } from '../../../../src/tools/frame/bh-iframe-read';
import { bhIframeType } from '../../../../src/tools/frame/bh-iframe-type';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

describe('iframe tools', () => {
  it('reads iframe target refs in debug and act modes', async () => {
    const rpc = rpcClient(async (message) => {
      expect(message).toMatchObject({
        type: 'BH_IFRAME_READ',
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
      'bh_iframe_read'
    );
    expect(router.listToolContracts('act').map((tool) => tool.name)).toContain(
      'bh_iframe_read'
    );
    expect(router.listToolContracts('ask').map((tool) => tool.name)).not.toContain(
      'bh_iframe_read'
    );

    const result = await router.execute(
      {
        tool: 'bh_iframe_read',
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

  it('clicks iframe targets only after readiness passes', async () => {
    const calls: string[] = [];
    const tool = bhIframeClick(
      rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === 'BH_IFRAME_READ') {
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
        expect(message).toMatchObject({
          type: 'BH_IFRAME_CLICK',
          frameId: 7,
          refId: 'ref_200',
          actionToken: 'BH_RUNTIME_AUTHORIZED_IFRAME_ACTION'
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

    expect(calls).toEqual(['BH_IFRAME_READ', 'BH_IFRAME_CLICK']);
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

    expect(calls).toEqual(['BH_IFRAME_READ']);
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
        if (message.type === 'BH_IFRAME_READ') {
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

    expect(calls.map((call) => call.type)).toEqual(['BH_IFRAME_READ', 'BH_IFRAME_TYPE']);
    expect(calls[1]).toMatchObject({
      text: 'hello@example.com',
      actionToken: 'BH_RUNTIME_AUTHORIZED_IFRAME_ACTION',
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

    expect(calls).toEqual(['BH_IFRAME_READ']);
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
