import { describe, expect, it, vi } from 'vitest';

import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { bhShadowList, bhShadowQuery } from '../../../../src/tools/shadow/bh-shadow-tools';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

describe('shadow tools', () => {
  it('lists open shadow roots through content RPC', async () => {
    const request: ContentRpcClient['request'] = vi.fn(async () => ({
      ok: true as const,
      shadowRoots: [{
        hostSelector: '#search-widget',
        hostTagName: 'x-search',
        mode: 'open' as const,
        childCount: 2,
        interactiveCount: 1,
        textPreview: 'Search'
      }]
    }));

    const result = await bhShadowList(rpc(request)).execute({}, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });

    expect(request).toHaveBeenCalledWith({ type: CONTENT_RPC_MESSAGES.SHADOW_LIST });
    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false,
      data: { shadowRoots: [expect.objectContaining({ hostSelector: '#search-widget' })] }
    });
    expect(result.summary).toContain('host=#search-widget');
    expect(result.summary).toContain('interactive=1');
    expect(result.summary).toContain('Search');
  });

  it('queries a selected shadow root without changing page state', async () => {
    const request: ContentRpcClient['request'] = vi.fn(async () => ({
      ok: true as const,
      shadowQuery: {
        hostSelector: '#menu-widget',
        selector: 'button',
        elements: [{ tagName: 'button', name: 'Open menu', role: 'button' }]
      }
    }));

    const result = await bhShadowQuery(rpc(request)).execute({
      hostSelector: '#menu-widget',
      selector: 'button'
    }, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });

    expect(request).toHaveBeenCalledWith({
      type: CONTENT_RPC_MESSAGES.SHADOW_QUERY,
      hostSelector: '#menu-widget',
      selector: 'button'
    });
    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false
    });
    expect(JSON.stringify(result.data)).toContain('"hostSelector":"#menu-widget"');
    expect(result.summary).toContain('#menu-widget');
    expect(result.summary).toContain('name=Open menu');
    expect(result.summary).toContain('role=button');
  });

  it('registers stable v1.5 shadow tool names', () => {
    expect(bhShadowList(rpc()).name).toBe(TOOL_NAMES.SHADOW_LIST);
    expect(bhShadowQuery(rpc()).name).toBe(TOOL_NAMES.SHADOW_QUERY);
  });
});

function rpc(request?: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: request ?? vi.fn<ContentRpcClient['request']>()
  };
}
