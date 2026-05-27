import { describe, expect, it, vi } from 'vitest';
import { CachedObservationRpcClient } from '../../../../../src/background/runtime/run/diagnostics/cached-observation-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../../src/shared/constants/event-names';
import type { ToolResult } from '../../../../../src/shared/schemas/tool-result.schema';

describe('CachedObservationRpcClient', () => {
  const observation = {
    url: 'https://example.com',
    title: 'Test',
    currentDomain: 'example.com',
    origin: 'https://example.com',
    visibleTextSummary: 'hello',
    pageStateSummary: '',
    refSummary: [],
    warnings: []
  };

  const cachedResult: ToolResult = {
    ok: true,
    code: 'OK',
    summary: 'Observed',
    changedPage: false,
    requiresObserve: false,
    data: observation
  };

  it('returns cached observation for PAGE_OBSERVE requests', async () => {
    const calls: unknown[] = [];
    const fallback = {
      request: vi.fn().mockImplementation((_msg: unknown) => {
        calls.push(_msg);
        return Promise.resolve({ ok: true });
      })
    };
    const client = new CachedObservationRpcClient(fallback, cachedResult);

    const resp = await client.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
    expect(resp.ok).toBe(true);
    expect((resp as Record<string, unknown>).observation).toBe(observation);
    expect(calls).toHaveLength(0);
  });

  it('falls through to fallback for non-PAGE_OBSERVE requests', async () => {
    const calls: unknown[] = [];
    const fallback = {
      request: vi.fn().mockImplementation((_msg: unknown) => {
        calls.push(_msg);
        return Promise.resolve({ ok: true });
      })
    };
    const client = new CachedObservationRpcClient(fallback, cachedResult);

    await client.request({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    expect(calls).toHaveLength(1);
  });

  it('falls through when observeResult is not ok', async () => {
    const calls: unknown[] = [];
    const fallback = {
      request: vi.fn().mockImplementation((_msg: unknown) => {
        calls.push(_msg);
        return Promise.resolve({ ok: true });
      })
    };
    const failedResult: ToolResult = { ok: false, code: 'ERR', summary: 'fail', changedPage: false, requiresObserve: false };
    const client = new CachedObservationRpcClient(fallback, failedResult);

    await client.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
    expect(calls).toHaveLength(1);
  });

  it('falls through when observeResult.data is null', async () => {
    const calls: unknown[] = [];
    const fallback = {
      request: vi.fn().mockImplementation((_msg: unknown) => {
        calls.push(_msg);
        return Promise.resolve({ ok: true });
      })
    };
    const nullDataResult: ToolResult = { ok: true, code: 'OK', summary: 'ok', changedPage: false, requiresObserve: false, data: null };
    const client = new CachedObservationRpcClient(fallback, nullDataResult);

    await client.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
    expect(calls).toHaveLength(1);
  });
});
