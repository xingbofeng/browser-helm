import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { bhIframeList } from '../../../../src/tools/frame/bh-iframe-list';
import { bhIframeRead } from '../../../../src/tools/frame/bh-iframe-read';
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

    expect(router.listToolContracts('debug').map((tool) => tool.name)).toContain(TOOL_NAMES.IFRAME_READ);
    expect(router.listToolContracts('act').map((tool) => tool.name)).toContain(TOOL_NAMES.IFRAME_READ);
    expect(router.listToolContracts('ask').map((tool) => tool.name)).toContain(TOOL_NAMES.IFRAME_READ);

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
    const tool = bhIframeRead(
      rpcClient(async () => ({
        ok: false,
        code: ERROR_CODES.OBSERVATION_FAILED,
        message: 'unexpected'
      }))
    );

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

  it('does not expose iframe mutating tools', () => {
    expect(Object.values(TOOL_NAMES)).not.toContain('bh_iframe_click');
    expect(Object.values(TOOL_NAMES)).not.toContain('bh_iframe_type');
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
  };
}
