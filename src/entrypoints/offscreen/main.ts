import { OFFSCREEN_MESSAGES } from '../../shared/constants/event-names';

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isClipboardMessage(message)) {
    return false;
  }
  void handleClipboardMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : 'clipboard_operation_failed'
      });
    });
  return true;
});

type ClipboardMessage =
  | { type: typeof OFFSCREEN_MESSAGES.CLIPBOARD; operation: 'read' }
  | { type: typeof OFFSCREEN_MESSAGES.CLIPBOARD; operation: 'write'; text: string };

async function handleClipboardMessage(message: ClipboardMessage) {
  if (message.operation === 'read') {
    const text = await readClipboardText();
    return { ok: true as const, text };
  }
  await writeClipboardText(message.text);
  return {
    ok: true as const,
    textLength: message.text.length,
    changedClipboard: true
  };
}

async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-hidden', 'true');
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const pasted = document.execCommand('paste');
    const text = textarea.value;
    textarea.remove();
    if (!pasted) {
      throw new Error('Clipboard read failed: paste command was rejected');
    }
    return text;
  }
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.value = text;
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
      throw new Error('Clipboard write failed: copy command was rejected');
    }
  }
}

function isClipboardMessage(value: unknown): value is ClipboardMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.type !== OFFSCREEN_MESSAGES.CLIPBOARD) {
    return false;
  }
  if (record.operation === 'read') {
    return true;
  }
  return record.operation === 'write' && typeof record.text === 'string';
}
