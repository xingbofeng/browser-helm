import { afterEach, describe, expect, it, vi } from 'vitest';

import { DownloadManager } from '../../../src/background/download-manager';

describe('DownloadManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists downloads with URL query/hash and local paths redacted', async () => {
    const search = vi.fn(async () => [
      {
        id: 42,
        url: 'https://example.com/report.txt?token=secret#section',
        finalUrl: 'https://cdn.example.com/report.txt?sig=secret',
        filename: '/Users/counter/Downloads/private/report.txt',
        mime: 'text/plain',
        state: 'complete',
        danger: 'safe',
        bytesReceived: 12,
        totalBytes: 12,
        exists: true,
        startTime: '2026-06-01T01:00:00.000Z',
        endTime: '2026-06-01T01:00:01.000Z'
      }
    ]);
    vi.stubGlobal('chrome', { downloads: { search } });

    const downloads = await new DownloadManager().listDownloads({ limit: 5 });

    expect(search).toHaveBeenCalledWith({ limit: 5, orderBy: ['-startTime'] });
    expect(downloads).toEqual([
      expect.objectContaining({
        downloadId: 42,
        fileName: 'report.txt',
        fileExtension: 'txt',
        url: 'https://example.com/report.txt',
        finalUrl: 'https://cdn.example.com/report.txt',
        mime: 'text/plain',
        state: 'complete',
        danger: 'safe',
        exists: true
      })
    ]);
    expect(JSON.stringify(downloads)).not.toContain('/Users/counter');
    expect(JSON.stringify(downloads)).not.toContain('token=secret');
    expect(JSON.stringify(downloads)).not.toContain('sig=secret');
  });

  it('redacts sensitive URL path and filename metadata', async () => {
    const search = vi.fn(async () => [
      {
        id: 43,
        url: 'https://example.com/files/alice@example.com/sk-liveDownloadSecret/report.pdf?token=secret#frag',
        filename: '/Users/counter/Downloads/alice@example.com-sk-liveDownloadSecret.pdf',
        mime: 'application/pdf',
        state: 'complete'
      }
    ]);
    vi.stubGlobal('chrome', { downloads: { search } });

    const downloads = await new DownloadManager().listDownloads({ limit: 1 });
    const serialized = JSON.stringify(downloads);

    expect(downloads[0]).toMatchObject({
      fileName: '[REDACTED_EMAIL]-[MASKED].pdf',
      url: 'https://example.com/files/[REDACTED_EMAIL]/[MASKED]/report.pdf'
    });
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('sk-liveDownloadSecret');
    expect(serialized).not.toContain('token=secret');
  });

  it('returns unavailable when chrome.downloads is missing', async () => {
    vi.stubGlobal('chrome', {});

    await expect(new DownloadManager().listDownloads()).rejects.toThrow(
      'chrome.downloads permission or API is unavailable'
    );
  });

  it('describes why downloaded local file content cannot be read directly', async () => {
    const search = vi.fn(async () => [
      {
        id: 7,
        url: 'https://example.com/private.pdf?token=secret',
        filename: 'C:\\Users\\counter\\Downloads\\private.pdf',
        mime: 'application/pdf',
        state: 'complete',
        danger: 'safe',
        exists: true
      }
    ]);
    vi.stubGlobal('chrome', { downloads: { search } });

    const result = await new DownloadManager().describeDownloadedFile(7);

    expect(search).toHaveBeenCalledWith({ id: 7, limit: 1 });
    expect(result.download).toMatchObject({
      downloadId: 7,
      fileName: 'private.pdf',
      url: 'https://example.com/private.pdf'
    });
    expect(result).toEqual({
      download: result.download,
      readable: false,
      reason: 'Browser extensions cannot read arbitrary local downloaded files directly.',
      fallback: 'Open the file in a browser tab or use a document/PDF extraction tool for browser-accessible content.'
    });
    expect(JSON.stringify(result)).not.toContain('C:\\Users');
    expect(JSON.stringify(result)).not.toContain('token=secret');
  });
});
