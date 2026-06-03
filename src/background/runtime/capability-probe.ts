import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';
import { resolveRuntimeCapabilities } from '../../runtime/capabilities/runtime-capabilities';

type ChromePermissionsApi = {
  contains?: (permissions: { permissions?: string[]; origins?: string[] }) => boolean | Promise<boolean>;
  getAll?: () => Promise<{ permissions?: string[]; origins?: string[] }>;
};

type ChromeLike = {
  permissions?: ChromePermissionsApi | undefined;
};

export type RuntimeCapabilityProbeInput = {
  tabId?: number | undefined;
  chromeApi?: ChromeLike | undefined;
};

export type RuntimeCapabilityProbeResult = {
  capabilities: RuntimeCapabilities;
  limitations: string[];
};

export async function probeRuntimeCapabilities(
  input: RuntimeCapabilityProbeInput = {}
): Promise<RuntimeCapabilityProbeResult> {
  const chromeApi = input.chromeApi ?? (globalThis.chrome as ChromeLike | undefined);
  const limitations: string[] = [];
  const hasActiveTab = typeof input.tabId === 'number' && input.tabId > 0;
  if (!hasActiveTab) {
    limitations.push('No active tab is available');
  }

  if (!chromeApi?.permissions?.contains || !chromeApi.permissions.getAll) {
    limitations.push('Chrome permissions API unavailable');
    return {
      capabilities: resolveRuntimeCapabilities({
        hasActiveTab,
        cdp: 'unavailable'
      }),
      limitations
    };
  }

  const [
    hasDebuggerPermission,
    hasDownloadsPermission,
    hasClipboardRead,
    hasClipboardWrite,
    allPermissionsUnknown
  ] = await Promise.all([
    containsPermission(chromeApi.permissions, 'debugger'),
    containsPermission(chromeApi.permissions, 'downloads'),
    containsPermission(chromeApi.permissions, 'clipboardRead'),
    containsPermission(chromeApi.permissions, 'clipboardWrite'),
    chromeApi.permissions.getAll()
  ]);
  const allPermissions = isRecord(allPermissionsUnknown) ? allPermissionsUnknown : {};
  const hasClipboardPermission = hasClipboardRead || hasClipboardWrite;
  const origins = allPermissions.origins;
  const hostPermissions = Array.isArray(origins)
    ? origins.filter((origin): origin is string => typeof origin === 'string' && origin.length > 0)
    : [];

  if (!hasDebuggerPermission) limitations.push('Debugger capability is unavailable');
  if (!hasDownloadsPermission) limitations.push('Downloads capability is unavailable');
  if (!hasClipboardPermission) limitations.push('Clipboard capability is unavailable');

  return {
    capabilities: resolveRuntimeCapabilities({
      hasActiveTab,
      hasDebuggerPermission,
      hasDownloadsPermission,
      hasClipboardPermission,
      hasStorageInspection: hasActiveTab,
      hostPermissions,
      shallowDebugAvailable: hasActiveTab,
      cdp: hasDebuggerPermission ? 'available' : 'unavailable'
    }),
    limitations
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function containsPermission(
  permissionsApi: ChromePermissionsApi,
  permission: string
): Promise<boolean> {
  try {
    return await permissionsApi.contains?.({ permissions: [permission] }) === true;
  } catch {
    return false;
  }
}
