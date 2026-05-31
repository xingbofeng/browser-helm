import type { DownloadSummary, DownloadedFileReadLimitation } from '../shared/schemas/file';

export type DownloadListOptions = {
  limit?: number;
  state?: 'in_progress' | 'interrupted' | 'complete';
};

type DownloadsApi = {
  search: (query: Record<string, unknown>) => Promise<ChromeDownloadItem[]>;
};

type ChromeDownloadItem = {
  id?: number;
  url?: string;
  finalUrl?: string;
  filename?: string;
  mime?: string;
  state?: string;
  danger?: string;
  bytesReceived?: number;
  totalBytes?: number;
  exists?: boolean;
  startTime?: string;
  endTime?: string;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export class DownloadManager {
  async listDownloads(options: DownloadListOptions = {}): Promise<DownloadSummary[]> {
    const downloads = ensureDownloadsApi();
    const query: Record<string, unknown> = {
      limit: clampLimit(options.limit),
      orderBy: ['-startTime']
    };
    if (options.state) {
      query.state = options.state;
    }
    const items = await downloads.search(query);
    return items.flatMap((item) => {
      const summary = summarizeDownload(item);
      return summary ? [summary] : [];
    });
  }

  async describeDownloadedFile(downloadId: number): Promise<DownloadedFileReadLimitation> {
    const downloads = ensureDownloadsApi();
    const [item] = await downloads.search({ id: downloadId, limit: 1 });
    const download = item ? summarizeDownload(item) : undefined;
    if (!download) {
      throw new Error(`Download ${downloadId} not found`);
    }
    return {
      download,
      readable: false,
      reason: 'Browser extensions cannot read arbitrary local downloaded files directly.',
      fallback: 'Open the file in a browser tab or use a document/PDF extraction tool for browser-accessible content.'
    };
  }
}

export const defaultDownloadManager = new DownloadManager();

function ensureDownloadsApi(): DownloadsApi {
  const downloads = globalThis.chrome?.downloads as DownloadsApi | undefined;
  if (!downloads?.search) {
    throw new Error('chrome.downloads permission or API is unavailable');
  }
  return downloads;
}

function summarizeDownload(item: ChromeDownloadItem): DownloadSummary | undefined {
  if (!item.id || item.id <= 0) {
    return undefined;
  }
  const fileName = displayFileName(item);
  return {
    downloadId: item.id,
    ...(fileName ? { fileName } : {}),
    ...(fileName ? readExtension(fileName) : {}),
    ...(sanitizeUrl(item.url) ? { url: sanitizeUrl(item.url) } : {}),
    ...(sanitizeUrl(item.finalUrl) ? { finalUrl: sanitizeUrl(item.finalUrl) } : {}),
    ...(item.mime ? { mime: item.mime } : {}),
    state: normalizeState(item.state),
    ...(item.danger ? { danger: item.danger } : {}),
    ...(typeof item.bytesReceived === 'number' ? { bytesReceived: item.bytesReceived } : {}),
    ...(typeof item.totalBytes === 'number' ? { totalBytes: item.totalBytes } : {}),
    ...(typeof item.exists === 'boolean' ? { exists: item.exists } : {}),
    ...(item.startTime ? { startTime: item.startTime } : {}),
    ...(item.endTime ? { endTime: item.endTime } : {})
  };
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function basename(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(/[\\/]/u).filter(Boolean).at(-1);
}

function displayFileName(item: ChromeDownloadItem): string | undefined {
  const localName = basename(item.filename);
  const urlName = basenameFromUrl(item.finalUrl) ?? basenameFromUrl(item.url);
  return localName && readExtension(localName).fileExtension
    ? localName
    : urlName ?? localName;
}

function basenameFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return basename(url.pathname);
  } catch {
    return undefined;
  }
}

function readExtension(fileName: string): { fileExtension?: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) {
    return {};
  }
  return { fileExtension: fileName.slice(dot + 1).toLowerCase() };
}

function normalizeState(value: string | undefined): DownloadSummary['state'] {
  return value === 'in_progress' || value === 'interrupted' || value === 'complete'
    ? value
    : 'unknown';
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}
