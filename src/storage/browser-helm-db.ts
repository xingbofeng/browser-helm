import Dexie, { type Table } from 'dexie';

import type { MemoryEntry } from '../shared/schemas/memory';
import type { ScratchpadEntry } from '../shared/schemas/scratchpad';
import type { WorkflowMemory } from '../shared/schemas/workflow';
import { memoryEntrySchema } from '../shared/schemas/memory';
import { scratchpadEntrySchema } from '../shared/schemas/scratchpad';
import { workflowMemorySchema } from '../shared/schemas/workflow';

export type MemoryRepoPersistence = {
  load: () => Promise<MemoryEntry[]>;
  put: (entry: MemoryEntry) => Promise<void>;
  delete: (id: string) => Promise<void>;
  clearDomain: (domain: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

export type WorkflowRepoPersistence = {
  load: () => Promise<WorkflowMemory[]>;
  put: (workflow: WorkflowMemory) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

export type ScratchpadRepoPersistence = {
  load: () => Promise<ScratchpadEntry[]>;
  put: (entry: ScratchpadEntry) => Promise<void>;
};

class BrowserHelmDb extends Dexie {
  memory!: Table<MemoryEntry, string>;
  workflows!: Table<WorkflowMemory, string>;
  scratchpads!: Table<ScratchpadEntry, string>;

  constructor() {
    super('browser-helm-v1-2');
    this.version(1).stores({
      memory: 'id,domain,updatedAt,lastUsedAt',
      workflows: 'id,domain,updatedAt,lastUsedAt',
      scratchpads: 'runId,updatedAt'
    });
  }
}

let db: BrowserHelmDb | undefined;

export function createIndexedDbMemoryPersistence(): MemoryRepoPersistence | undefined {
  const database = browserHelmDb();
  if (!database) {
    return undefined;
  }
  return {
    load: async () => {
      const rows = await database.memory.toArray();
      return rows.flatMap((row) => parseMemoryEntry(row));
    },
    put: async (entry) => {
      await database.memory.put(memoryEntrySchema.parse(entry));
    },
    delete: async (id) => {
      await database.memory.delete(id);
    },
    clearDomain: async (domain) => {
      await database.memory.where('domain').equals(domain).delete();
    },
    clearAll: async () => {
      await database.memory.clear();
    }
  };
}

export function createIndexedDbWorkflowPersistence(): WorkflowRepoPersistence | undefined {
  const database = browserHelmDb();
  if (!database) {
    return undefined;
  }
  return {
    load: async () => {
      const rows = await database.workflows.toArray();
      return rows.flatMap((row) => parseWorkflowMemory(row));
    },
    put: async (workflow) => {
      await database.workflows.put(workflowMemorySchema.parse(workflow));
    },
    delete: async (id) => {
      await database.workflows.delete(id);
    }
  };
}

export function createIndexedDbScratchpadPersistence(): ScratchpadRepoPersistence | undefined {
  const database = browserHelmDb();
  if (!database) {
    return undefined;
  }
  return {
    load: async () => {
      const rows = await database.scratchpads.toArray();
      return rows.flatMap((row) => parseScratchpadEntry(row));
    },
    put: async (entry) => {
      await database.scratchpads.put(scratchpadEntrySchema.parse(entry));
    }
  };
}

function browserHelmDb(): BrowserHelmDb | undefined {
  if (typeof globalThis.indexedDB === 'undefined') {
    return undefined;
  }
  db ??= new BrowserHelmDb();
  return db;
}

function parseMemoryEntry(value: unknown): MemoryEntry[] {
  const parsed = memoryEntrySchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

function parseWorkflowMemory(value: unknown): WorkflowMemory[] {
  const parsed = workflowMemorySchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

function parseScratchpadEntry(value: unknown): ScratchpadEntry[] {
  const parsed = scratchpadEntrySchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}
