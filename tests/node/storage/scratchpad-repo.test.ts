import { describe, expect, it } from 'vitest';

import { ScratchpadRepo } from '../../../src/storage/scratchpad-repo';
import type { ScratchpadRepoPersistence } from '../../../src/storage/browser-helm-db';

describe('ScratchpadRepo', () => {
  it('appends, replaces, and clears per-run scratchpad content', () => {
    const repo = new ScratchpadRepo();

    repo.append('run_1', 'First fact');
    repo.append('run_1', 'Second fact');

    expect(repo.read('run_1').content).toBe('First fact\nSecond fact');
    expect(repo.replace('run_1', 'Compacted').content).toBe('Compacted');
    expect(repo.clear('run_1').content).toBe('');
  });

  it('masks sensitive scratchpad content', () => {
    const repo = new ScratchpadRepo();
    const entry = repo.append('run_1', 'password=hunter2 and code 4111111111111111');

    expect(entry.content).not.toContain('hunter2');
    expect(entry.content).not.toContain('4111111111111111');
  });

  it('mirrors scratchpad updates to persistence', async () => {
    const contents: string[] = [];
    const persistence: ScratchpadRepoPersistence = {
      load: async () => [],
      put: async (entry) => {
        contents.push(entry.content);
      }
    };
    const repo = new ScratchpadRepo(persistence);

    repo.append('run_1', 'First fact');
    repo.replace('run_1', 'Compacted');
    repo.clear('run_1');
    await Promise.resolve();

    expect(contents).toEqual(['First fact', 'Compacted', '']);
  });
});
