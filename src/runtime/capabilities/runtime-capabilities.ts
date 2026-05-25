import type { RuntimeCapabilities } from '../../shared/schemas/runtime-capabilities.schema';

type RuntimeCapabilityInput = Partial<RuntimeCapabilities>;

export function resolveRuntimeCapabilities(
  input: RuntimeCapabilityInput
): RuntimeCapabilities {
  return {
    hasActiveTab: input.hasActiveTab ?? false,
    hasDebuggerPermission: input.hasDebuggerPermission ?? false,
    hasClipboardPermission: input.hasClipboardPermission ?? false,
    hasDownloadsPermission: input.hasDownloadsPermission ?? false,
    hostPermissions: input.hostPermissions ?? [],
    shallowDebugAvailable: input.shallowDebugAvailable ?? false,
    cdp: input.cdp ?? 'reserved'
  };
}
