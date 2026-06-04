import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';
import { resolveRuntimeCapabilities } from '../../runtime/capabilities/runtime-capabilities';
import { ChromePermissionBroker, type ChromePermissionBrokerApi } from './permission-broker';

export type RuntimeCapabilityProbeInput = {
  tabId?: number | undefined;
  chromeApi?: ChromePermissionBrokerApi | undefined;
  permissionBroker?: ChromePermissionBroker | undefined;
};

export type RuntimeCapabilityProbeResult = {
  capabilities: RuntimeCapabilities;
  limitations: string[];
};

export async function probeRuntimeCapabilities(
  input: RuntimeCapabilityProbeInput = {}
): Promise<RuntimeCapabilityProbeResult> {
  const permissionBroker = input.permissionBroker ?? new ChromePermissionBroker(input.chromeApi);
  const limitations: string[] = [];
  const hasActiveTab = typeof input.tabId === 'number' && input.tabId > 0;
  if (!hasActiveTab) {
    limitations.push('No active tab is available');
  }

  if (!permissionBroker.isAvailable()) {
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
    hostPermissions
  ] = await Promise.all([
    permissionBroker.hasPermission('debugger'),
    permissionBroker.hasPermission('downloads'),
    permissionBroker.hasPermission('clipboardRead'),
    permissionBroker.hasPermission('clipboardWrite'),
    permissionBroker.getGrantedOrigins()
  ]);
  const hasClipboardPermission = hasClipboardRead || hasClipboardWrite;

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
