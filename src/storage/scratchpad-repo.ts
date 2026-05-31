import { sanitizeMemoryText } from '../agent/memory/memory-write-policy';
import type { ScratchpadEntry } from '../shared/schemas/scratchpad';
import {
  createIndexedDbScratchpadPersistence,
  type ScratchpadRepoPersistence
} from './browser-helm-db';

export class ScratchpadRepo {
  private readonly entries = new Map<string, ScratchpadEntry>();

  constructor(private readonly persistence?: ScratchpadRepoPersistence | undefined) {
    void this.hydrate();
  }

  read(runId: string): ScratchpadEntry {
    const existing = this.entries.get(runId);
    if (existing) {
      return existing;
    }
    const now = Date.now();
    return {
      runId,
      content: '',
      createdAt: now,
      updatedAt: now
    };
  }

  append(runId: string, text: string): ScratchpadEntry {
    const current = this.read(runId);
    const separator = current.content.trim() ? '\n' : '';
    return this.replace(runId, `${current.content}${separator}${sanitizeMemoryText(text).value}`);
  }

  replace(runId: string, content: string): ScratchpadEntry {
    const current = this.entries.get(runId);
    const now = Date.now();
    const entry: ScratchpadEntry = {
      runId,
      content: sanitizeMemoryText(content).value,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    this.entries.set(runId, entry);
    void this.persistence?.put(entry);
    return entry;
  }

  clear(runId: string): ScratchpadEntry {
    return this.replace(runId, '');
  }

  private async hydrate(): Promise<void> {
    const persisted = await this.persistence?.load();
    for (const entry of persisted ?? []) {
      this.entries.set(entry.runId, entry);
    }
  }
}

export const defaultScratchpadRepo = new ScratchpadRepo(createIndexedDbScratchpadPersistence());
