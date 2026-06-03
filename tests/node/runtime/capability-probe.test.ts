import { describe, expect, it, vi } from 'vitest';

import { probeRuntimeCapabilities } from '../../../src/background/runtime/capability-probe';

describe('probeRuntimeCapabilities', () => {
  it('reads granted Chrome permissions and host origins', async () => {
    const chromeApi = {
      permissions: {
        contains: vi.fn(async (input: unknown) => {
          const permissions = typeof input === 'object' && input !== null && 'permissions' in input
            ? (input as { permissions?: string[] }).permissions
            : undefined;
          return permissions?.includes('debugger') === true ||
            permissions?.includes('downloads') === true ||
            permissions?.includes('clipboardWrite') === true;
        }),
        getAll: vi.fn(async () => ({
          origins: ['https://example.com/*']
        }))
      }
    };

    const result = await probeRuntimeCapabilities({ tabId: 42, chromeApi });

    expect(result.capabilities).toMatchObject({
      hasActiveTab: true,
      hasDebuggerPermission: true,
      hasDownloadsPermission: true,
      hasClipboardPermission: true,
      hostPermissions: ['https://example.com/*'],
      shallowDebugAvailable: true,
      cdp: 'available'
    });
    expect(result.limitations).toEqual([]);
  });

  it('fails closed when Chrome permission APIs are unavailable', async () => {
    const result = await probeRuntimeCapabilities({ tabId: undefined, chromeApi: {} });

    expect(result.capabilities).toMatchObject({
      hasActiveTab: false,
      hasDebuggerPermission: false,
      hasClipboardPermission: false,
      hasDownloadsPermission: false,
      shallowDebugAvailable: false,
      cdp: 'unavailable'
    });
    expect(result.limitations).toEqual(
      expect.arrayContaining([
        'Chrome permissions API unavailable',
        'No active tab is available'
      ])
    );
  });

  it('reflects revoked permissions before the next probe result', async () => {
    const contains = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const chromeApi = {
      permissions: {
        contains,
        getAll: vi.fn(async () => ({ origins: [] }))
      }
    };

    const first = await probeRuntimeCapabilities({ tabId: 42, chromeApi });
    const second = await probeRuntimeCapabilities({ tabId: 42, chromeApi });

    expect(first.capabilities.hasDebuggerPermission).toBe(true);
    expect(second.capabilities.hasDebuggerPermission).toBe(false);
    expect(second.capabilities.cdp).toBe('unavailable');
  });
});
