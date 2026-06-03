import type { ContentRpcClient } from '../page/messaging/content-rpc-client';
import { ToolRegistry } from './core/tool-registry';
import type { ToolSpec } from './core/tool-spec';
export {
  TOOL_MANIFEST,
  TOOL_MANIFEST_MODULES_HASH,
  type ToolManifestEntry
} from './tool-manifest';
import { TOOL_MANIFEST } from './tool-manifest';

export function createToolRegistry(rpc: ContentRpcClient): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of listToolSpecs(rpc)) {
    registry.register(tool);
  }
  return registry;
}

export function listToolSpecs(rpc: ContentRpcClient): ToolSpec<unknown, unknown>[] {
  return TOOL_MANIFEST.flatMap((entry) => entry.tools.map((factory) => factory(rpc)));
}
