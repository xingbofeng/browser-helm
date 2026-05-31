import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClipboardManager } from '../../../src/background/clipboard-manager';

describe('ClipboardManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an offscreen document before writing clipboard text', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      textLength: 11,
      changedClipboard: true
    });
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(false),
        createDocument
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://id/${path}`,
        sendMessage
      }
    });

    const result = await new ClipboardManager().writeText('hello world');

    expect(createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Read and write clipboard only after BrowserHelm user approval.'
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'BH_OFFSCREEN_CLIPBOARD',
      operation: 'write',
      text: 'hello world'
    });
    expect(result).toEqual({ textLength: 11, changedClipboard: true });
  });

  it('reads clipboard text through the offscreen document', async () => {
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(true),
        createDocument: vi.fn()
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://id/${path}`,
        sendMessage: vi.fn().mockResolvedValue({
          ok: true,
          text: 'clipboard value'
        })
      }
    });

    const result = await new ClipboardManager().readText();

    expect(result).toEqual({ text: 'clipboard value', textLength: 15 });
  });

  it('returns an actionable error when clipboard APIs are unavailable', async () => {
    vi.stubGlobal('chrome', {});

    await expect(new ClipboardManager().writeText('x')).rejects.toThrow(
      'chrome.offscreen clipboard API is unavailable'
    );
  });
});
