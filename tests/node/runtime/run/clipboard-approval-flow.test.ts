import { describe, expect, it, vi } from 'vitest';

import { ClipboardApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/clipboard-approval-flow';
import { snapshotToolResult } from '../../../../src/background/runtime/run/run-snapshot-assembler';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('ClipboardApprovalFlow', () => {
  it('writes clipboard text only after approval and clears pending state', async () => {
    const writeText = vi.fn().mockResolvedValue({ textLength: 12, changedClipboard: true });
    const deletePendingAction = vi.fn();
    const setSnapshot = vi.fn();
    const flow = new ClipboardApprovalFlow({
      ...deps({
        getPendingAction: () => ({
          runId: 'run_1',
          tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
          args: { text: 'approved copy' }
        }),
        deletePendingAction,
        setSnapshot,
        clipboardManager: { writeText, readText: vi.fn() }
      })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_1',
      tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL
    });

    expect(writeText).toHaveBeenCalledWith('approved copy');
    expect(deletePendingAction).toHaveBeenCalledWith('apr_1');
    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      data: { operation: 'write', textLength: 12, changedClipboard: true }
    });
    expect(JSON.stringify(result)).not.toContain('approved copy');
    expect(setSnapshot).toHaveBeenLastCalledWith('run_1', expect.objectContaining({
      status: 'observed',
      pendingApproval: undefined
    }));
  });

  it('returns clipboard text after read approval while masking snapshot detail', async () => {
    const setSnapshot = vi.fn();
    const flow = new ClipboardApprovalFlow({
      ...deps({
        getPendingAction: () => ({
          runId: 'run_1',
          tool: TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
          args: {}
        }),
        setSnapshot,
        clipboardManager: {
          writeText: vi.fn(),
          readText: vi.fn().mockResolvedValue({ text: 'approved read value', textLength: 19 })
        }
      })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_1',
      tool: TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      data: { operation: 'read', sensitiveText: 'approved read value', textLength: 19 }
    });
    expect(setSnapshot.mock.calls.at(-1)?.[1]).toMatchObject({
      toolResult: {
        detail: {
          data: {
            sensitiveText: '[MASKED]'
          }
        }
      }
    });
  });
});

function deps(overrides: Record<string, unknown> = {}) {
  return {
    getRecord: vi.fn().mockReturnValue({ task: 'copy', mode: 'full', tabId: 1, trace: [] }),
    getPendingAction: vi.fn(),
    deletePendingAction: vi.fn(),
    appendTrace: vi.fn(),
    setSnapshot: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'full', status: 'waiting_for_approval', trace: [] }),
    snapshotToolResult,
    clipboardManager: { writeText: vi.fn(), readText: vi.fn() },
    ...overrides
  };
}
