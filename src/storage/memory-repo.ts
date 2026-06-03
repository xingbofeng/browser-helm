import { sanitizeMemoryText } from '../agent/memory/memory-write-policy';
import type { MemoryEntry, MemoryHit } from '../shared/schemas/memory';
import {
  createIndexedDbMemoryPersistence,
  type MemoryRepoPersistence
} from './browser-helm-db';

export type SaveMemoryInput = {
  domain: string;
  origin?: string | undefined;
  kind?: MemoryEntry['kind'] | undefined;
  task: string;
  summary: string;
  sourceRunId?: string | undefined;
  tags?: string[] | undefined;
};

export class MemoryRepo {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly persistence?: MemoryRepoPersistence | undefined) {
    void this.hydrate();
  }

  save(input: SaveMemoryInput): MemoryEntry {
    const domain = requireDomain(input.domain);
    const now = Date.now();
    const id = createId('mem');
    const entry: MemoryEntry = {
      id,
      domain,
      ...(input.origin ? { origin: input.origin } : {}),
      kind: input.kind ?? 'domain_fact',
      task: sanitizeMemoryText(input.task).value,
      summary: sanitizeMemoryText(input.summary).value,
      ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
      successCount: 0,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
      tags: input.tags?.map((tag) => sanitizeMemoryText(tag).value) ?? [],
      masked: true
    };
    this.entries.set(id, entry);
    void this.persistence?.put(entry);
    return entry;
  }

  update(id: string, patch: Partial<Pick<MemoryEntry, 'task' | 'summary' | 'tags' | 'successCount' | 'failureCount'>>): MemoryEntry | undefined {
    const current = this.entries.get(id);
    if (!current) {
      return undefined;
    }
    const next: MemoryEntry = {
      ...current,
      ...(patch.task ? { task: sanitizeMemoryText(patch.task).value } : {}),
      ...(patch.summary ? { summary: sanitizeMemoryText(patch.summary).value } : {}),
      ...(patch.tags ? { tags: patch.tags.map((tag) => sanitizeMemoryText(tag).value) } : {}),
      ...(patch.successCount !== undefined ? { successCount: patch.successCount } : {}),
      ...(patch.failureCount !== undefined ? { failureCount: patch.failureCount } : {}),
      updatedAt: Date.now(),
      masked: true
    };
    this.entries.set(id, next);
    void this.persistence?.put(next);
    return next;
  }

  delete(id: string): boolean {
    const deleted = this.entries.delete(id);
    if (deleted) {
      void this.persistence?.delete(id);
    }
    return deleted;
  }

  clearDomain(domain: string): number {
    const count = this.deleteMatching((entry) => entry.domain === domain);
    if (count > 0) {
      void this.persistence?.clearDomain(domain);
    }
    return count;
  }

  clearAll(): number {
    const count = this.entries.size;
    this.entries.clear();
    if (count > 0) {
      void this.persistence?.clearAll();
    }
    return count;
  }

  list(domain?: string): MemoryEntry[] {
    const scopedDomain = domain === undefined ? undefined : requireDomain(domain);
    return [...this.entries.values()]
      .filter((entry) => scopedDomain ? entry.domain === scopedDomain : true)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  lookup(input: { domain: string; query?: string | undefined; limit?: number | undefined }): MemoryHit[] {
    const domain = requireDomain(input.domain);
    const queryTokens = tokenize(input.query ?? '');
    return this.list(domain)
      .map((entry) => ({
        ...entry,
        score: scoreMemory(entry, queryTokens)
      }))
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
      .slice(0, input.limit ?? 5)
      .map((hit) => {
        const updated: MemoryEntry = {
          ...hit,
          lastUsedAt: Date.now()
        };
        this.entries.set(hit.id, updated);
        void this.persistence?.put(updated);
        return {
          ...updated,
          score: hit.score
        };
      });
  }

  private deleteMatching(predicate: (entry: MemoryEntry) => boolean): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (predicate(entry)) {
        this.entries.delete(entry.id);
        count += 1;
      }
    }
    return count;
  }

  private async hydrate(): Promise<void> {
    const persisted = await this.persistence?.load();
    for (const entry of persisted ?? []) {
      this.entries.set(entry.id, entry);
    }
  }
}

export const defaultMemoryRepo = new MemoryRepo(createIndexedDbMemoryPersistence());

function scoreMemory(entry: MemoryEntry, queryTokens: string[]): number {
  if (!queryTokens.length) {
    return 1 + entry.successCount - entry.failureCount * 0.5;
  }
  const haystack = `${entry.task} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  return matches / queryTokens.length + entry.successCount * 0.1 - entry.failureCount * 0.1;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^\p{Letter}\p{Number}_]+/u).filter(Boolean);
}

function requireDomain(domain: string): string {
  const normalized = domain.trim();
  if (!normalized) {
    throw new Error('Memory domain is required');
  }
  return normalized;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
