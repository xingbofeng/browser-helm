import { describe, expect, it, vi } from 'vitest';

import { ChromePermissionBroker } from '../../../src/background/runtime/permission-broker';

describe('ChromePermissionBroker', () => {
  it('reads granted permissions and origins through one broker boundary', async () => {
    const contains = vi.fn(async (input: { permissions?: string[] }) =>
      input.permissions?.includes('downloads') === true
    );
    const broker = new ChromePermissionBroker({
      permissions: {
        contains,
        getAll: vi.fn(async () => ({ origins: ['https://example.com/*'] }))
      }
    });

    await expect(broker.hasPermission('downloads')).resolves.toBe(true);
    await expect(broker.hasPermission('clipboardRead')).resolves.toBe(false);
    await expect(broker.getGrantedOrigins()).resolves.toEqual(['https://example.com/*']);
  });

  it('requests optional permissions through Chrome and reports denial without throwing', async () => {
    const request = vi.fn(async (_input: unknown) => false);
    const broker = new ChromePermissionBroker({
      permissions: {
        contains: vi.fn(async () => false),
        getAll: vi.fn(async () => ({ origins: [] })),
        request
      }
    });

    await expect(broker.requestPermissions({ permissions: ['downloads'] })).resolves.toEqual({
      granted: false,
      permissions: ['downloads'],
      origins: []
    });
    expect(request).toHaveBeenCalledWith({ permissions: ['downloads'] });
  });

  it('requests clipboard capability through one named broker API', async () => {
    const request = vi.fn(async (_input: unknown) => true);
    const broker = new ChromePermissionBroker({
      permissions: {
        contains: vi.fn(async () => false),
        getAll: vi.fn(async () => ({ origins: [] })),
        request
      }
    });

    await expect(broker.requestCapability('clipboard')).resolves.toEqual({
      capability: 'clipboard',
      granted: true,
      permissions: ['clipboardRead', 'clipboardWrite'],
      origins: []
    });
    expect(request).toHaveBeenCalledWith({
      permissions: ['clipboardRead', 'clipboardWrite']
    });
  });

  it('does not request debugger as an optional capability', async () => {
    const request = vi.fn(async (_input: unknown) => true);
    const broker = new ChromePermissionBroker({
      permissions: {
        contains: vi.fn(async () => false),
        getAll: vi.fn(async () => ({ origins: [] })),
        request
      }
    });

    await expect(broker.requestCapability('debugger')).resolves.toEqual({
      capability: 'debugger',
      granted: false,
      permissions: ['debugger'],
      origins: [],
      reason: 'debugger is a required Chrome permission and cannot be requested optionally'
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('re-reads permission state on every call so revoked permissions are reflected', async () => {
    const broker = new ChromePermissionBroker({
      permissions: {
        contains: vi.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
        getAll: vi.fn(async () => ({ origins: [] }))
      }
    });

    await expect(broker.hasPermission('debugger')).resolves.toBe(true);
    await expect(broker.hasPermission('debugger')).resolves.toBe(false);
  });
});
