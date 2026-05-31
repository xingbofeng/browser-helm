import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentManager } from '../../../src/background/document-manager';

const textPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000335 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`;

const scannedPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
186
%%EOF`;

describe('DocumentManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads browser-accessible text documents with URL query redacted and truncation metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('abcdef', {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })));

    const result = await new DocumentManager().readUrl({
      url: 'https://example.com/report.txt?token=secret#frag',
      maxChars: 4
    });

    expect(result).toMatchObject({
      sourceUrl: 'https://example.com/report.txt',
      mimeType: 'text/plain',
      text: 'abcd',
      pageStart: 1,
      pageEnd: 1,
      pageCount: 1,
      scanned: false,
      truncated: true
    });
    expect(JSON.stringify(result)).not.toContain('token=secret');
  });

  it('extracts text and page metadata from PDF documents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new TextEncoder().encode(textPdf), {
      headers: { 'content-type': 'application/pdf' }
    })));

    const result = await new DocumentManager().readUrl({
      url: 'https://example.com/manual.pdf',
      maxChars: 100
    });

    expect(result).toMatchObject({
      sourceUrl: 'https://example.com/manual.pdf',
      mimeType: 'application/pdf',
      text: 'Hello PDF',
      pageStart: 1,
      pageEnd: 1,
      pageCount: 1,
      scanned: false,
      truncated: false
    });
  });

  it('marks PDF documents with no extractable text as scanned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new TextEncoder().encode(scannedPdf), {
      headers: { 'content-type': 'application/pdf' }
    })));

    const result = await new DocumentManager().readUrl({
      url: 'https://example.com/scanned.pdf',
      maxChars: 100
    });

    expect(result).toMatchObject({
      text: '',
      pageCount: 1,
      scanned: true,
      truncated: false
    });
  });
});
