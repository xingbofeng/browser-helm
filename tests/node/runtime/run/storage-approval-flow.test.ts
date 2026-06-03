import { describe, expect, it, vi } from 'vitest';

import { StorageApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/storage-approval-flow';
import { snapshotToolResult } from '../../../../src/background/runtime/run/run-snapshot-assembler';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('StorageApprovalFlow', () => {
  it('sets Web Storage only after approval and masks the written value in snapshots', async () => {
    const request = vi.fn(async () => ({
      ok: true,
      storageMutation: {
        area: 'localStorage',
        operation: 'set',
        key: 'theme',
        changed: true,
        valueLength: 4
      }
    }));
    const setSnapshot = vi.fn();
    const flow = new StorageApprovalFlow({
      ...deps({
        getPendingAction: () => ({
          runId: 'run_1',
          tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
          args: { area: 'localStorage', key: 'theme', value: 'dark' }
        }),
        createContentRpcClient: () => ({ request }),
        setSnapshot
      })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_1',
      tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL
    });

    expect(request).toHaveBeenCalledWith({
      type: CONTENT_RPC_MESSAGES.STORAGE_SET,
      area: 'localStorage',
      key: 'theme',
      value: 'dark'
    });
    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: true,
      requiresObserve: true
    });
    expect(JSON.stringify(setSnapshot.mock.calls.at(-1)?.[1])).not.toContain('dark');
  });

  it('does not mutate Web Storage when approved execution has no stored pending action', async () => {
    const request = vi.fn();
    const flow = new StorageApprovalFlow({
      ...deps({
        getPendingAction: () => undefined,
        createContentRpcClient: () => ({ request })
      })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_missing',
      tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.TOOL_EXECUTION_FAILED,
      changedPage: false
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('deletes and clears Web Storage only after approval', async () => {
    const request = vi.fn(async (message: unknown) => ({
      ok: true,
      storageMutation: {
        area: 'sessionStorage',
        operation: typeof message === 'object' && message && 'type' in message && message.type === CONTENT_RPC_MESSAGES.STORAGE_CLEAR
          ? 'clear'
          : 'delete',
        changed: true,
        affectedCount: 1
      }
    }));
    const flow = new StorageApprovalFlow({
      ...deps({
        getPendingAction: vi.fn()
          .mockReturnValueOnce({
            runId: 'run_1',
            tool: TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
            args: { area: 'sessionStorage', key: 'wizardStep' }
          })
          .mockReturnValueOnce({
            runId: 'run_1',
            tool: TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL,
            args: { area: 'sessionStorage' }
          }),
        createContentRpcClient: () => ({ request })
      })
    });

    await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_1',
      tool: TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL
    });
    await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_2',
      tool: TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      type: CONTENT_RPC_MESSAGES.STORAGE_DELETE,
      area: 'sessionStorage',
      key: 'wizardStep'
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      type: CONTENT_RPC_MESSAGES.STORAGE_CLEAR,
      area: 'sessionStorage'
    });
  });

  it('denies storage approval without mutating Web Storage', () => {
    const request = vi.fn();
    const flow = new StorageApprovalFlow({
      ...deps({
        createContentRpcClient: () => ({ request })
      })
    });

    const result = flow.onDenied();

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL,
      changedPage: false
    });
    expect(request).not.toHaveBeenCalled();
  });
});

function deps(overrides: Record<string, unknown> = {}) {
  return {
    getRecord: vi.fn().mockReturnValue({ task: 'storage change', mode: 'full', tabId: 1, trace: [] }),
    getPendingAction: vi.fn(),
    deletePendingAction: vi.fn(),
    appendTrace: vi.fn(),
    setSnapshot: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'full', status: 'waiting_for_approval', trace: [] }),
    createContentRpcClient: vi.fn(),
    snapshotToolResult,
    ...overrides
  };
}
