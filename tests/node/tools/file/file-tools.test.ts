import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { bhDownloadList, bhFileReadDownload, bhFileUploadWithApproval } from '../../../../src/tools/file/bh-file-tools';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

describe('file/download advanced tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists recent downloads as a safe advanced tool with redacted metadata', async () => {
    vi.stubGlobal('chrome', {
      downloads: {
        search: vi.fn(async () => [
          {
            id: 9,
            url: 'https://example.com/export.csv?token=secret#frag',
            filename: '/Users/counter/Downloads/export.csv',
            mime: 'text/csv',
            state: 'complete',
            danger: 'safe',
            exists: true
          }
        ])
      }
    });
    const tool = bhDownloadList();

    expect(tool.name).toBe(TOOL_NAMES.DOWNLOAD_LIST);
    expect(tool.modes).toEqual(['advanced']);
    expect(tool.risk).toBe('safe');
    expect(tool.readOnly).toBe(true);

    const result = await tool.execute({ limit: 10 }, { runId: 'r1', stepId: 's1', runMode: 'full' });

    expect(result.ok).toBe(true);
    expect(result.code).toBe(ERROR_CODES.OK);
    expect(JSON.stringify(result.data)).toContain('export.csv');
    expect(JSON.stringify(result.data)).not.toContain('/Users/counter');
    expect(JSON.stringify(result.data)).not.toContain('token=secret');
  });

  it('exposes local downloaded file reads as approval-gated and returns a structured limitation if executed directly', async () => {
    vi.stubGlobal('chrome', {
      downloads: {
        search: vi.fn(async () => [
          {
            id: 3,
            url: 'https://example.com/manual.pdf?token=secret',
            filename: '/Users/counter/Downloads/manual.pdf',
            mime: 'application/pdf',
            state: 'complete',
            danger: 'safe',
            exists: true
          }
        ])
      }
    });
    const tool = bhFileReadDownload();

    expect(tool.name).toBe(TOOL_NAMES.FILE_READ_DOWNLOAD);
    expect(tool.risk).toBe('high');
    expect(tool.requiresApproval).toBe(true);

    const result = await tool.execute({ downloadId: 3 }, { runId: 'r1', stepId: 's1', runMode: 'full' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.FILE_READ_UNAVAILABLE);
    expect(result.requiresApproval).toBe(true);
    expect(JSON.stringify(result.data)).toContain('manual.pdf');
    expect(JSON.stringify(result.data)).not.toContain('/Users/counter');
    expect(JSON.stringify(result.data)).not.toContain('token=secret');
  });

  it('creates an approval boundary for file uploads without reading local paths', async () => {
    const tool = bhFileUploadWithApproval();

    expect(tool.name).toBe(TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL);
    expect(tool.risk).toBe('high');
    expect(tool.readOnly).toBe(false);
    expect(tool.requiresApproval).toBe(true);

    const result = await tool.execute(
      { targetRefId: 'ref_upload_1', fileName: '/Users/counter/secret/avatar.png', reason: '上传头像' },
      { runId: 'r1', stepId: 's1', runMode: 'full' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      changedPage: false,
      requiresObserve: false,
      requiresApproval: true
    });
    expect(JSON.stringify(result)).toContain('avatar.png');
    expect(JSON.stringify(result)).not.toContain('/Users/counter');
  });

  it('registers download/file tools for Full mode contracts', () => {
    const registry = new ToolRegistry();
    registry.register(bhDownloadList());
    registry.register(bhFileReadDownload());
    registry.register(bhFileUploadWithApproval());

    const contracts = new ToolRouter(registry).listToolContracts('full');

    expect(contracts.map((tool) => tool.name)).toEqual([
      TOOL_NAMES.DOWNLOAD_LIST,
      TOOL_NAMES.FILE_READ_DOWNLOAD,
      TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL
    ]);
    expect(contracts.find((tool) => tool.name === TOOL_NAMES.FILE_READ_DOWNLOAD)?.requiresApproval).toBe(true);
    expect(contracts.find((tool) => tool.name === TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL)?.requiresApproval).toBe(true);
  });
});
