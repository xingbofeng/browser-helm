import type { BatchImageCollectionResult, PageImageItem } from '../../shared/schemas/page-media';

type ImageFetchResponse = {
  ok?: boolean;
  headers?: Pick<Headers, 'get'> | undefined;
  blob: () => Promise<Blob>;
};

type ImageZipOptions = {
  fetcher?: ((url: string) => Promise<ImageFetchResponse>) | undefined;
};

type ZipFile = {
  path: string;
  data: Uint8Array;
};

type ImageZipManifestItem = {
  tabId: number;
  url: string;
  source: PageImageItem['source'];
  path?: string | undefined;
  status: 'downloaded' | 'failed' | 'skipped';
  reason?: string | undefined;
};

const textEncoder = new TextEncoder();
let crcTable: Uint32Array | undefined;

export async function createImageCollectionZip(
  imageCollection: BatchImageCollectionResult,
  options: ImageZipOptions = {}
): Promise<Blob> {
  const fetcher = options.fetcher ?? globalThis.fetch?.bind(globalThis);
  const files: ZipFile[] = [];
  const manifestItems: ImageZipManifestItem[] = [];
  const usedPaths = new Set<string>();

  for (const page of imageCollection.pages) {
    let index = 0;
    for (const image of page.images) {
      index += 1;
      if (!isFetchableImageUrl(image.url)) {
        manifestItems.push({
          tabId: page.tabId,
          url: image.url,
          source: image.source,
          status: 'skipped',
          reason: 'unsupported_image_url'
        });
        continue;
      }
      if (typeof fetcher !== 'function') {
        manifestItems.push({
          tabId: page.tabId,
          url: image.url,
          source: image.source,
          status: 'failed',
          reason: 'fetch_unavailable'
        });
        continue;
      }
      try {
        const response = await fetcher(image.url);
        if (response.ok === false) {
          throw new Error('image_fetch_failed');
        }
        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const path = uniqueZipPath(
          `images/tab-${page.tabId}/${String(index).padStart(3, '0')}-${imageFileName(image, blob.type)}`,
          usedPaths
        );
        files.push({ path, data: bytes });
        manifestItems.push({
          tabId: page.tabId,
          url: image.url,
          source: image.source,
          path,
          status: 'downloaded'
        });
      } catch (error) {
        manifestItems.push({
          tabId: page.tabId,
          url: image.url,
          source: image.source,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'image_fetch_failed'
        });
      }
    }
  }

  files.push({
    path: 'manifest.json',
    data: textEncoder.encode(JSON.stringify({
      scope: imageCollection.scope,
      requestedTabCount: imageCollection.requestedTabCount,
      succeededCount: imageCollection.succeededCount,
      failedCount: imageCollection.failedCount,
      totalImageCount: imageCollection.totalImageCount,
      pages: imageCollection.pages.map((page) => ({
        tabId: page.tabId,
        pageUrl: page.pageUrl,
        tabTitle: page.tabTitle,
        imageCount: page.imageCount,
        lazyLoad: page.lazyLoad
      })),
      images: manifestItems,
      failures: imageCollection.failures
    }, null, 2))
  });

  return createZipBlob(files);
}

function createZipBlob(files: ZipFile[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = textEncoder.encode(file.path);
    const crc = crc32(file.data);
    const localHeader = concatBytes(
      le32(0x04034b50),
      le16(20),
      le16(0),
      le16(0),
      le16(0),
      le16(0),
      le32(crc),
      le32(file.data.byteLength),
      le32(file.data.byteLength),
      le16(name.byteLength),
      le16(0),
      name
    );
    localParts.push(localHeader, file.data);
    centralParts.push(concatBytes(
      le32(0x02014b50),
      le16(20),
      le16(20),
      le16(0),
      le16(0),
      le16(0),
      le16(0),
      le32(crc),
      le32(file.data.byteLength),
      le32(file.data.byteLength),
      le16(name.byteLength),
      le16(0),
      le16(0),
      le16(0),
      le16(0),
      le32(0),
      le32(offset),
      name
    ));
    offset += localHeader.byteLength + file.data.byteLength;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const end = concatBytes(
    le32(0x06054b50),
    le16(0),
    le16(0),
    le16(files.length),
    le16(files.length),
    le32(centralSize),
    le32(offset),
    le16(0)
  );

  const output = concatBytes(...localParts, ...centralParts, end);
  const body = new ArrayBuffer(output.byteLength);
  new Uint8Array(body).set(output);
  return new Blob([body], { type: 'application/zip' });
}

function isFetchableImageUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

function imageFileName(image: PageImageItem, mimeType: string): string {
  const fromUrl = fileNameFromUrl(image.url);
  const fallback = sanitizeFileSegment(image.alt ?? image.title ?? image.source) || 'image';
  return ensureExtension(sanitizeFileSegment(fromUrl) || fallback, mimeType);
}

function fileNameFromUrl(url: string): string | undefined {
  const withoutHash = url.split('#')[0] ?? url;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  const last = withoutQuery.split('/').filter(Boolean).at(-1);
  if (!last) {
    return undefined;
  }
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function sanitizeFileSegment(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
}

function ensureExtension(fileName: string, mimeType: string): string {
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/iu.test(fileName)) {
    return fileName;
  }
  return `${fileName}${extensionForMimeType(mimeType)}`;
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

function uniqueZipPath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const base = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : '';
  let index = 2;
  while (usedPaths.has(`${base}-${index}${ext}`)) {
    index += 1;
  }
  const unique = `${base}-${index}${ext}`;
  usedPaths.add(unique);
  return unique;
}

function le16(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff
  ]);
}

function le32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}
