import type { ToolPromptContract } from './tool-router';

/**
 * Generates a stable, deterministic hash of the tool manifest.
 *
 * The hash covers the security-relevant fields of every tool contract:
 * name, description, argsSchema, risk, readOnly, requiresApproval,
 * approvalBehavior, modes, and contextVisibility. Tools are sorted by name before hashing
 * so the output is independent of iteration order.
 *
 * Fields NOT included (intentionally): title (display-only).
 *
 * Uses a simple FNV-1a 32-bit hash for determinism across JS runtimes
 * without requiring the Web Crypto API.
 */
export function toolManifestHash(contracts: ToolPromptContract[]): string {
  const sorted = [...contracts].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const parts: string[] = [];
  for (const contract of sorted) {
    parts.push(
      contract.name,
      contract.description,
      JSON.stringify(contract.argsSchema),
      contract.risk,
      String(contract.readOnly),
      String(contract.requiresApproval),
      contract.approvalBehavior ?? '',
      contract.modes.slice().sort().join(','),
      contract.contextVisibility
    );
  }
  const input = parts.join('|');
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV prime (2^24 + 2^8 + 0x93)
    hash = Math.imul(hash, 16777619);
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
