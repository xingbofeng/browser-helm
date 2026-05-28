import type { ContentRpcClient } from '../page/messaging/content-rpc-client';
import { ToolRegistry } from './core/tool-registry';
import type { ToolSpec } from './core/tool-spec';

type ToolFactory = (rpc: ContentRpcClient) => ToolSpec<unknown, unknown>;
type ToolModule = Record<string, unknown>;

const toolModules = import.meta.glob<ToolModule>('./**/bh-*.ts', { eager: true });

export function createToolRegistry(rpc: ContentRpcClient): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of listToolSpecs(rpc)) {
    registry.register(tool);
  }
  return registry;
}

export function listToolSpecs(rpc: ContentRpcClient): ToolSpec<unknown, unknown>[] {
  return Object.entries(toolModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, module]) => Object.values(module))
    .map((candidate) => resolveToolSpec(candidate, rpc))
    .filter((tool): tool is ToolSpec<unknown, unknown> => tool != null);
}

function resolveToolSpec(
  candidate: unknown,
  rpc: ContentRpcClient
): ToolSpec<unknown, unknown> | undefined {
  if (isToolSpec(candidate)) {
    return candidate;
  }
  if (typeof candidate !== 'function') {
    return undefined;
  }
  const result = (candidate as ToolFactory)(rpc);
  return isToolSpec(result) ? result : undefined;
}

function isToolSpec(value: unknown): value is ToolSpec<unknown, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.title === 'string' &&
    typeof record.description === 'string' &&
    Array.isArray(record.modes) &&
    typeof record.risk === 'string' &&
    typeof record.execute === 'function'
  );
}
