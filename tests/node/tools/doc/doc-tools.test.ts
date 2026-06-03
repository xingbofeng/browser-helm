import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { bhDocReadUrl } from '../../../../src/tools/doc/bh-doc-tools';

describe('doc tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a browser-accessible document URL as a safe advanced tool', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('BrowserHelm document', {
      headers: { 'content-type': 'text/plain' }
    })));
    const tool = bhDocReadUrl();

    expect(tool.name).toBe(TOOL_NAMES.DOC_READ_URL);
    expect(tool.modes).toEqual(['advanced']);
    expect(tool.risk).toBe('safe');
    expect(tool.readOnly).toBe(true);

    const result = await tool.execute({
      url: 'https://example.com/doc.txt?token=secret',
      maxChars: 100
    }, { runId: 'r1', stepId: 's1', runMode: 'full' });

    expect(result.ok).toBe(true);
    expect(result.code).toBe(ERROR_CODES.OK);
    expect(result.summary).toContain('BrowserHelm document');
    expect(JSON.stringify(result.data)).toContain('BrowserHelm document');
    expect(JSON.stringify(result.data)).not.toContain('token=secret');
  });
});
