import { describe, expect, it, vi } from 'vitest';

describe('content script config', () => {
  it('injects into all frames at document_start', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const module = await import('../../../src/entrypoints/content');

    expect(module.contentScript).toMatchObject({
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start'
    });
  });
});
