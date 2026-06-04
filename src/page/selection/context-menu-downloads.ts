import { createImageCollectionZip } from '../../ui/components/vision-downloads';
import { CONTEXT_MENU_DOWNLOAD_MESSAGE } from '../../shared/constants/context-menu-download';
import type { BatchImageCollectionResult } from '../../shared/schemas/page-media';

export { CONTEXT_MENU_DOWNLOAD_MESSAGE };

type ContextMenuDownloadMessage = {
  type: typeof CONTEXT_MENU_DOWNLOAD_MESSAGE;
  downloads: Array<
    | {
        kind: 'data_url';
        fileName: string;
        dataUrl: string;
      }
    | {
        kind: 'image_collection_zip';
        fileName: string;
        imageCollection: BatchImageCollectionResult;
      }
  >;
};

type HandleContextMenuDownloadOptions = {
  document: Document;
  message: unknown;
  createObjectUrl?: ((blob: Blob) => string) | undefined;
  revokeObjectUrl?: ((url: string) => void) | undefined;
  createImageCollectionZip?: ((imageCollection: BatchImageCollectionResult) => Promise<Blob>) | undefined;
};

export async function handleContextMenuDownloadMessage(options: HandleContextMenuDownloadOptions): Promise<
  | {
      ok: true;
      downloadedCount: number;
    }
  | {
      ok: false;
      reason: 'unsupported_message';
    }
> {
  if (!isContextMenuDownloadMessage(options.message)) {
    return { ok: false, reason: 'unsupported_message' };
  }

  let downloadedCount = 0;
  for (const item of options.message.downloads) {
    if (item.kind === 'data_url') {
      downloadHref({
        document: options.document,
        href: item.dataUrl,
        fileName: item.fileName
      });
      downloadedCount += 1;
      continue;
    }
    const zipCreator = options.createImageCollectionZip ?? ((imageCollection: unknown) =>
      createImageCollectionZip(imageCollection as BatchImageCollectionResult));
    const zip = await zipCreator(item.imageCollection);
    const objectUrl = createObjectUrl(zip, options);
    downloadHref({
      document: options.document,
      href: objectUrl,
      fileName: item.fileName
    });
    const revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;
    revokeObjectUrl?.(objectUrl);
    downloadedCount += 1;
  }

  return { ok: true, downloadedCount };
}

function downloadHref(input: { document: Document; href: string; fileName: string }): void {
  const anchor = input.document.createElement('a');
  anchor.href = input.href;
  anchor.download = input.fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  (input.document.body ?? input.document.documentElement).append(anchor);
  anchor.click();
  anchor.remove();
}

function createObjectUrl(blob: Blob, options: HandleContextMenuDownloadOptions): string {
  if (options.createObjectUrl) {
    return options.createObjectUrl(blob);
  }
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return `data:application/zip;base64,${btoa(String.fromCharCode(...new Uint8Array([])))}`;
}

function defaultRevokeObjectUrl(url: string): void {
  if (!url.startsWith('blob:') || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  URL.revokeObjectURL(url);
}

function isContextMenuDownloadMessage(value: unknown): value is ContextMenuDownloadMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === CONTEXT_MENU_DOWNLOAD_MESSAGE && Array.isArray(record.downloads);
}
