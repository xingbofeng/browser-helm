import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/storage/memory-repo';
import type { MemoryRepoPersistence } from '../../../src/storage/browser-helm-db';

describe('MemoryRepo', () => {
  it('saves, ranks, updates, and deletes domain memory', () => {
    const repo = new MemoryRepo();
    const entry = repo.save({
      domain: 'app.example.com',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices',
      tags: ['billing']
    });

    expect(repo.lookup({ domain: 'app.example.com', query: 'invoice' })[0]?.id).toBe(entry.id);
    expect(repo.update(entry.id, { successCount: 2 })?.successCount).toBe(2);
    expect(repo.delete(entry.id)).toBe(true);
    expect(repo.lookup({ domain: 'app.example.com', query: 'invoice' })).toEqual([]);
  });

  it('requires a non-empty domain scope for saving and lookup', () => {
    const repo = new MemoryRepo();

    expect(() => repo.save({
      domain: '',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices'
    })).toThrow('Memory domain is required');
    expect(() => repo.lookup({ domain: '', query: 'invoice' })).toThrow('Memory domain is required');
  });

  it('does not leak sensitive values into stored memory', () => {
    const repo = new MemoryRepo();
    const entry = repo.save({
      domain: 'app.example.com',
      task: 'Login with password: hunter2',
      summary: 'OTP=123456 worked',
      tags: ['card 4111111111111111']
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('123456');
    expect(serialized).not.toContain('4111111111111111');
    expect(entry.masked).toBe(true);
  });

  it('mirrors writes and clears to persistence', async () => {
    const persisted: string[] = [];
    const deleted: string[] = [];
    const clearedDomains: string[] = [];
    let clearedAll = false;
    const persistence: MemoryRepoPersistence = {
      load: async () => [],
      put: async (entry) => {
        persisted.push(entry.id);
      },
      delete: async (id) => {
        deleted.push(id);
      },
      clearDomain: async (domain) => {
        clearedDomains.push(domain);
      },
      clearAll: async () => {
        clearedAll = true;
      }
    };
    const repo = new MemoryRepo(persistence);

    const entry = repo.save({
      domain: 'app.example.com',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices'
    });
    repo.lookup({ domain: 'app.example.com', query: 'invoice' });
    repo.delete(entry.id);
    repo.save({
      domain: 'app.example.com',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices'
    });
    repo.clearDomain('app.example.com');
    repo.save({
      domain: 'app.example.com',
      task: 'Open invoice report',
      summary: 'Use Billing > Invoices'
    });
    repo.clearAll();
    await Promise.resolve();

    expect(persisted.length).toBeGreaterThanOrEqual(3);
    expect(deleted).toEqual([entry.id]);
    expect(clearedDomains).toEqual(['app.example.com']);
    expect(clearedAll).toBe(true);
  });
});
