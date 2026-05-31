import { OFFSCREEN_MESSAGES } from '../shared/constants/event-names';

type ClipboardOffscreenMessage =
  | { type: typeof OFFSCREEN_MESSAGES.CLIPBOARD; operation: 'read' }
  | { type: typeof OFFSCREEN_MESSAGES.CLIPBOARD; operation: 'write'; text: string };

type ClipboardOffscreenResponse =
  | { ok: true; text: string }
  | { ok: true; textLength: number; changedClipboard: boolean }
  | { ok: false; message: string };

type ChromeClipboardApi = typeof chrome;

export type ClipboardManagerLike = {
  readText(): Promise<{ text: string; textLength: number }>;
  writeText(text: string): Promise<{ textLength: number; changedClipboard: boolean }>;
};

export class ClipboardManager implements ClipboardManagerLike {
  constructor(
    private readonly api: ChromeClipboardApi | undefined = globalThis.chrome,
    private readonly offscreenUrl = 'offscreen.html'
  ) {}

  async readText(): Promise<{ text: string; textLength: number }> {
    const response = await this.sendClipboardMessage({
      type: OFFSCREEN_MESSAGES.CLIPBOARD,
      operation: 'read'
    });
    if (!response.ok || !('text' in response)) {
      throw new Error(response.ok ? 'Clipboard read response invalid' : response.message);
    }
    return {
      text: response.text,
      textLength: response.text.length
    };
  }

  async writeText(text: string): Promise<{ textLength: number; changedClipboard: boolean }> {
    const response = await this.sendClipboardMessage({
      type: OFFSCREEN_MESSAGES.CLIPBOARD,
      operation: 'write',
      text
    });
    if (!response.ok || !('changedClipboard' in response)) {
      throw new Error(response.ok ? 'Clipboard write response invalid' : response.message);
    }
    return {
      textLength: response.textLength,
      changedClipboard: response.changedClipboard
    };
  }

  private async sendClipboardMessage(
    message: ClipboardOffscreenMessage
  ): Promise<ClipboardOffscreenResponse> {
    await this.ensureOffscreenDocument();
    const response: unknown = await this.api?.runtime?.sendMessage(message);
    if (isClipboardOffscreenResponse(response)) {
      return response;
    }
    throw new Error('Clipboard offscreen response invalid');
  }

  private async ensureOffscreenDocument(): Promise<void> {
    const offscreen = this.api?.offscreen;
    const runtime = this.api?.runtime;
    if (!offscreen?.hasDocument || !offscreen.createDocument || !runtime?.sendMessage) {
      throw new Error('chrome.offscreen clipboard API is unavailable');
    }
    if (await offscreen.hasDocument()) {
      return;
    }
    await offscreen.createDocument({
      url: this.offscreenUrl,
      reasons: ['CLIPBOARD'],
      justification: 'Read and write clipboard only after BrowserHelm user approval.'
    });
  }
}

function isClipboardOffscreenResponse(value: unknown): value is ClipboardOffscreenResponse {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.ok === false) {
    return typeof record.message === 'string';
  }
  if (record.ok !== true) {
    return false;
  }
  return typeof record.text === 'string' ||
    (typeof record.textLength === 'number' && typeof record.changedClipboard === 'boolean');
}

export const defaultClipboardManager = new ClipboardManager();
