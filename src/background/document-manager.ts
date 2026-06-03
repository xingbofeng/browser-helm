import type { DocumentReadResult } from '../shared/schemas/document';

export type DocumentReadOptions = {
  url: string;
  maxChars?: number;
  pageStart?: number;
  pageEnd?: number;
};

const DEFAULT_MAX_CHARS = 12_000;
const MAX_CHARS_LIMIT = 60_000;

export class DocumentManager {
  async readUrl(options: DocumentReadOptions): Promise<DocumentReadResult> {
    const response = await fetch(options.url);
    if (!response.ok) {
      throw new Error(`Document fetch failed with HTTP ${response.status}`);
    }
    const mimeType = normalizeMimeType(response.headers.get('content-type'), options.url);
    if (mimeType === 'application/pdf') {
      return this.readPdf(response, options, mimeType);
    }
    return this.readText(response, options, mimeType);
  }

  private async readText(
    response: Response,
    options: DocumentReadOptions,
    mimeType: string
  ): Promise<DocumentReadResult> {
    const text = await response.text();
    const maxChars = clampMaxChars(options.maxChars);
    return {
      sourceUrl: sanitizeUrl(options.url),
      mimeType,
      ...truncateText(text, maxChars),
      pageStart: 1,
      pageEnd: 1,
      pageCount: 1,
      scanned: false
    };
  }

  private async readPdf(
    response: Response,
    options: DocumentReadOptions,
    mimeType: string
  ): Promise<DocumentReadResult> {
    const data = new Uint8Array(await response.arrayBuffer());
    const pdfText = decodePdfBytes(data);
    const pageCount = countPdfPages(pdfText);
    const pageStart = clampPage(options.pageStart, 1, pageCount);
    const pageEnd = clampPage(options.pageEnd, pageStart, pageCount);
    const extraction = extractPdfTextForRange(pdfText, pageStart, pageEnd);
    const text = extraction.text.trim();
    return {
      sourceUrl: sanitizeUrl(options.url),
      mimeType,
      ...truncateText(text, clampMaxChars(options.maxChars)),
      pageStart,
      pageEnd,
      pageCount,
      scanned: text.length === 0,
      ...(text.length === 0 && extraction.filteredStream
        ? {
            unavailableReason: 'pdf_filter_unsupported',
            parserLimitations: [
              'Built-in PDF reader does not decompress filtered streams such as FlateDecode.'
            ]
          }
        : {})
    };
  }
}

export const defaultDocumentManager = new DocumentManager();

function normalizeMimeType(value: string | null, url: string): string {
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType) {
    return mimeType;
  }
  return url.toLowerCase().split(/[?#]/u, 1)[0]?.endsWith('.pdf') === true
    ? 'application/pdf'
    : 'text/plain';
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  return text.length > maxChars
    ? { text: text.slice(0, maxChars), truncated: true }
    : { text, truncated: false };
}

function clampMaxChars(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_CHARS;
  }
  return Math.max(1, Math.min(MAX_CHARS_LIMIT, Math.trunc(value)));
}

function clampPage(value: number | undefined, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function decodePdfBytes(data: Uint8Array): string {
  let result = '';
  for (const byte of data) {
    result += String.fromCharCode(byte);
  }
  return result;
}

function countPdfPages(source: string): number {
  const matches = source.match(/\/Type\s*\/Page\b/gu);
  return Math.max(1, matches?.length ?? 0);
}

function extractPdfText(source: string): string {
  return [
    ...extractLiteralText(source),
    ...extractHexText(source)
  ].join(' ').replace(/\s+/gu, ' ').trim();
}

function extractPdfTextForRange(source: string, pageStart: number, pageEnd: number): { text: string; filteredStream: boolean } {
  const objects = parsePdfObjects(source);
  const pages = [...objects.values()]
    .filter((object) => /\/Type\s*\/Page\b/u.test(object.body))
    .sort((left, right) => left.offset - right.offset);
  if (!pages.length) {
    return {
      text: extractPdfText(source),
      filteredStream: hasFilteredStream(source)
    };
  }
  const selectedStreams: string[] = [];
  let filteredStream = false;
  for (let index = pageStart - 1; index < pageEnd; index += 1) {
    const page = pages[index];
    if (!page) {
      continue;
    }
    for (const objectId of readPageContentObjectIds(page.body)) {
      const contentObject = objects.get(objectId);
      const stream = contentObject ? readStreamPayload(contentObject.body) : undefined;
      if (contentObject && hasFilteredStream(contentObject.body)) {
        filteredStream = true;
      }
      if (stream !== undefined) {
        selectedStreams.push(stream);
      }
    }
  }
  return {
    text: extractPdfText(selectedStreams.join('\n')),
    filteredStream
  };
}

function parsePdfObjects(source: string): Map<number, { body: string; offset: number }> {
  const objects = new Map<number, { body: string; offset: number }>();
  const objectPattern = /(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj\b/gu;
  for (const match of source.matchAll(objectPattern)) {
    const id = Number.parseInt(match[1] ?? '', 10);
    const body = match[2] ?? '';
    if (Number.isFinite(id)) {
      objects.set(id, { body, offset: match.index ?? 0 });
    }
  }
  return objects;
}

function readPageContentObjectIds(pageBody: string): number[] {
  const content = pageBody.match(/\/Contents\s*(?:\[(?<array>[^\]]+)\]|(?<single>\d+\s+\d+\s+R))/u);
  const rawRefs = content?.groups?.array ?? content?.groups?.single ?? '';
  const ids: number[] = [];
  for (const match of rawRefs.matchAll(/(\d+)\s+\d+\s+R/gu)) {
    const id = Number.parseInt(match[1] ?? '', 10);
    if (Number.isFinite(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function readStreamPayload(objectBody: string): string | undefined {
  const match = objectBody.match(/\bstream\r?\n?([\s\S]*?)\r?\n?endstream\b/u);
  return match?.[1];
}

function hasFilteredStream(value: string): boolean {
  return /\/Filter\b/u.test(value);
}

function extractLiteralText(source: string): string[] {
  const results: string[] = [];
  const textOperators = /\((?:\\.|[^\\)])*\)\s*(?:Tj|'|"|TJ)/gu;
  for (const match of source.matchAll(textOperators)) {
    const raw = match[0].slice(1, match[0].lastIndexOf(')'));
    const decoded = decodePdfLiteral(raw);
    if (decoded) {
      results.push(decoded);
    }
  }
  return results;
}

function extractHexText(source: string): string[] {
  const results: string[] = [];
  const hexOperators = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|"|TJ)/gu;
  for (const match of source.matchAll(hexOperators)) {
    const hex = match[1]?.replace(/\s+/gu, '') ?? '';
    const decoded = decodePdfHex(hex);
    if (decoded) {
      results.push(decoded);
    }
  }
  return results;
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/gu, (_match, escaped: string) => {
      if (escaped === 'n') return '\n';
      if (escaped === 'r') return '\r';
      if (escaped === 't') return '\t';
      if (escaped === 'b') return '\b';
      if (escaped === 'f') return '\f';
      return escaped;
    })
    .replace(/\\([0-7]{1,3})/gu, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8))
    );
}

function decodePdfHex(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2).padEnd(2, '0'), 16);
    if (Number.isFinite(byte)) {
      bytes.push(byte);
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}
