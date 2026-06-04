import { TOOL_NAMES, type ToolName } from '../shared/constants/tool-names';
import { CONTEXT_MENU_DOWNLOAD_MESSAGE } from '../shared/constants/context-menu-download';
import {
  batchImageCollectionResultSchema,
  type BatchImageCollectionResult
} from '../shared/schemas/page-media';
import type { ToolResult } from '../shared/schemas/tool-result.schema';

export { CONTEXT_MENU_DOWNLOAD_MESSAGE };

export type ContextMenuDownloadItem =
  | {
      kind: 'data_url';
      fileName: string;
      dataUrl: string;
    }
    | {
        kind: 'image_collection_zip';
        fileName: string;
        imageCollection: BatchImageCollectionResult;
      };

type SelectionContextDownloadChromeApi = {
  downloads?: {
    download?: (options: {
      url: string;
      filename: string;
      saveAs?: boolean;
    }) => Promise<number>;
  };
  tabs?: {
    sendMessage?: (
      tabId: number,
      message: {
        type: typeof CONTEXT_MENU_DOWNLOAD_MESSAGE;
        downloads: ContextMenuDownloadItem[];
      },
      options?: { frameId: number }
    ) => Promise<unknown>;
  };
};

export async function downloadVisionToolResult(input: {
  tabId: number;
  frameId?: number;
  tool: ToolName;
  result: unknown;
  chromeApi?: SelectionContextDownloadChromeApi;
}): Promise<void> {
  const downloads = downloadsFromVisionToolResult(input.tool, input.result);
  if (downloads.length === 0) {
    return;
  }
  const chromeApi = input.chromeApi ?? chrome;
  const fallbackDownloads: ContextMenuDownloadItem[] = [];
  for (const item of downloads) {
    if (item.kind !== 'data_url') {
      fallbackDownloads.push(item);
      continue;
    }
    const downloaded = await downloadDataUrlInBackground(chromeApi, item);
    if (!downloaded) {
      fallbackDownloads.push(item);
    }
  }
  if (fallbackDownloads.length === 0) {
    return;
  }
  const options = typeof input.frameId === 'number' ? { frameId: input.frameId } : undefined;
  await chromeApi.tabs?.sendMessage?.(input.tabId, {
    type: CONTEXT_MENU_DOWNLOAD_MESSAGE,
    downloads: fallbackDownloads
  }, options).catch(() => undefined);
}

export function downloadsFromVisionToolResult(tool: ToolName, result: unknown): ContextMenuDownloadItem[] {
  if (!isToolResult(result) || !result.ok || !isRecord(result.data)) {
    return [];
  }
  if (tool === TOOL_NAMES.VISION_CAPTURE_VIEWPORT || tool === TOOL_NAMES.VISION_CAPTURE_FULL_PAGE) {
    const screenshot = readScreenshot(result.data.screenshot);
    return screenshot ? [screenshotDownloadItem(screenshot)] : [];
  }
  if (tool === TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES) {
    const batchCapture = isRecord(result.data.batchCapture) ? result.data.batchCapture : undefined;
    const screenshots = Array.isArray(batchCapture?.screenshots) ? batchCapture.screenshots : [];
    return screenshots.flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      const screenshot = readScreenshot(item.screenshot);
      return screenshot
        ? [screenshotDownloadItem(screenshot, typeof item.tabTitle === 'string' ? item.tabTitle : undefined)]
        : [];
    });
  }
  if (tool === TOOL_NAMES.VISION_COLLECT_IMAGES && result.data.imageCollection) {
    const parsed = batchImageCollectionResultSchema.safeParse(result.data.imageCollection);
    if (!parsed.success) {
      return [];
    }
    return [{
      kind: 'image_collection_zip',
      fileName: 'browserhelm-page-images.zip',
      imageCollection: parsed.data
    }];
  }
  return [];
}

function screenshotDownloadItem(
  screenshot: { id: string; mode: string; mimeType: string; dataUrl: string },
  title?: string
): ContextMenuDownloadItem {
  return {
    kind: 'data_url',
    fileName: `${screenshotFileNamePrefix(screenshot.mode)}${title ? `-${sanitizeFileSegment(title)}` : ''}-${sanitizeFileSegment(screenshot.id)}${extensionForMimeType(screenshot.mimeType)}`,
    dataUrl: screenshot.dataUrl
  };
}

async function downloadDataUrlInBackground(
  chromeApi: SelectionContextDownloadChromeApi,
  item: Extract<ContextMenuDownloadItem, { kind: 'data_url' }>
): Promise<boolean> {
  if (typeof chromeApi.downloads?.download !== 'function') {
    return false;
  }
  try {
    await chromeApi.downloads.download({
      url: item.dataUrl,
      filename: item.fileName,
      saveAs: false
    });
    return true;
  } catch {
    return false;
  }
}

function screenshotFileNamePrefix(mode: string): string {
  if (mode === 'full_page') {
    return 'browserhelm-full-page';
  }
  if (mode === 'element') {
    return 'browserhelm-element';
  }
  return 'browserhelm-viewport';
}

function readScreenshot(value: unknown): { id: string; mode: string; mimeType: string; dataUrl: string } | undefined {
  if (!isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.mode !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.dataUrl !== 'string' ||
    !value.dataUrl.startsWith('data:image/')) {
    return undefined;
  }
  return {
    id: value.id,
    mode: value.mode,
    mimeType: value.mimeType,
    dataUrl: value.dataUrl
  };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/avif':
      return '.avif';
    case 'image/svg+xml':
      return '.svg';
    case 'image/bmp':
      return '.bmp';
    case 'image/png':
    default:
      return '.png';
  }
}

function sanitizeFileSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96) || 'download';
}

function isToolResult(value: unknown): value is ToolResult {
  return isRecord(value) &&
    typeof value.ok === 'boolean' &&
    typeof value.code === 'string' &&
    typeof value.summary === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
