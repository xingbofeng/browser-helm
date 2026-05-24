export type MemoryEntry = {
  key: string;
  value: string;
  updatedAt: number;
};

export interface MemoryStore {
  get(key: string): Promise<MemoryEntry | undefined>;
  set(entry: MemoryEntry): Promise<void>;
  list(): Promise<MemoryEntry[]>;
}
