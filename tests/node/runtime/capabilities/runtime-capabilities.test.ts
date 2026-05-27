import { describe, expect, it } from 'vitest';

import { resolveRuntimeCapabilities } from '../../../../src/runtime/capabilities/runtime-capabilities';

describe('resolveRuntimeCapabilities', () => {
  it('captures capability state with CDP reserved', () => {
    const result = resolveRuntimeCapabilities({
      hasActiveTab: true,
      hostPermissions: ['https://example.com/*'],
      shallowDebugAvailable: true
    });

    expect(result.hasActiveTab).toBe(true);
    expect(result.hasDebuggerPermission).toBe(false);
    expect(result.cdp).toBe('reserved');
    expect(result.shallowDebugAvailable).toBe(true);
  });

  it('defaults missing optional permissions to unavailable', () => {
    const result = resolveRuntimeCapabilities({});

    expect(result.hasActiveTab).toBe(false);
    expect(result.hostPermissions).toEqual([]);
    expect(result.hasClipboardPermission).toBe(false);
    expect(result.hasDownloadsPermission).toBe(false);
  });
});
