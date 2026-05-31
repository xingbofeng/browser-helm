import { describe, expect, it } from 'vitest';

import { bhClipboardReadWithApproval, bhClipboardWriteWithApproval } from '../../../../src/tools/clipboard/bh-clipboard-tools';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('clipboard tools', () => {
  it('requires approval before writing and does not expose clipboard text in the result', async () => {
    const result = await bhClipboardWriteWithApproval().execute(
      { text: 'copy secret token' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'full' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      data: { operation: 'write', textLength: 17 }
    });
    expect(JSON.stringify(result)).not.toContain('copy secret token');
  });

  it('requires approval before reading clipboard text', async () => {
    const result = await bhClipboardReadWithApproval().execute(
      {},
      { runId: 'run_1', stepId: 'step_1', runMode: 'full' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      data: { operation: 'read' }
    });
  });

  it('exposes clipboard contracts as high-risk advanced tools', () => {
    const registry = new ToolRegistry();
    registry.register(bhClipboardReadWithApproval());
    registry.register(bhClipboardWriteWithApproval());
    const contracts = new ToolRouter(registry).listToolContracts('full');

    expect(contracts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
        risk: 'high',
        modes: ['advanced'],
        readOnly: true,
        requiresApproval: true
      }),
      expect.objectContaining({
        name: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
        risk: 'high',
        modes: ['advanced'],
        readOnly: false,
        requiresApproval: true
      })
    ]));
  });
});
