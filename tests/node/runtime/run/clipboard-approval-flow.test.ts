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

  it('does not touch clipboard when approved execution has no stored pending action', async () => {
    const writeText = vi.fn();
    const flow = new ClipboardApprovalFlow({
      ...deps({
        getPendingAction: () => undefined,
        clipboardManager: { writeText, readText: vi.fn() }
      })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_missing',
      tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.CLIPBOARD_UNAVAILABLE,
      changedPage: false
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns clipboard text after read approval without exposing it to model context or snapshot detail', async () => {
    const setSnapshot = vi.fn();
    const readText = 'approved read value';
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
          readText: vi.fn().mockResolvedValue({ text: readText, textLength: 19 })
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
      data: { operation: 'read', sensitiveText: readText, textLength: 19 }
    });
    expect(result.context?.summary).toBe('Clipboard read completed after approval (19 characters).');
    expect(JSON.stringify(result.context)).not.toContain(readText);
    expect(setSnapshot.mock.calls.at(-1)?.[1]).toMatchObject({
      toolResult: {
        detail: {
          data: {
            sensitiveText: '[MASKED]'
          }
        }
      }
    });
    expect(JSON.stringify(setSnapshot.mock.calls.at(-1)?.[1])).not.toContain(readText);
  });

  it('denies clipboard approval without reading or writing clipboard state', () => {
    const clipboardManager = {
      writeText: vi.fn(),
      readText: vi.fn()
    };
    const flow = new ClipboardApprovalFlow({
      ...deps({ clipboardManager })
    });

    const result = flow.onDenied();

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL,
      changedPage: false
    });
    expect(clipboardManager.writeText).not.toHaveBeenCalled();
    expect(clipboardManager.readText).not.toHaveBeenCalled();
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
