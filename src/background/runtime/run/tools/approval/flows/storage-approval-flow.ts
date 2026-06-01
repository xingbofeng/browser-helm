import type { ContentRpcClient } from '../../../../../../page/messaging/content-rpc-client';
import type { ExecuteToolInput, RuntimeEvent, RunSnapshot } from '../../../../../../runtime/runtime-messages';
import { APPROVAL_EVENT_NAMES, CONTENT_RPC_MESSAGES } from '../../../../../../shared/constants/event-names';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../../shared/constants/tool-names';
import type { StorageArea, StorageMutationResult } from '../../../../../../shared/schemas/storage';
import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import { snapshotToolResult } from '../../../run-snapshot-assembler';
import type { ToolApprovalFlow } from './tool-approval-flow';

type StorageMutationAction =
  | { operation: 'set'; area: StorageArea; key: string; value: string }
  | { operation: 'delete'; area: StorageArea; key: string }
  | { operation: 'clear'; area: StorageArea };

export class StorageApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;

  constructor(
    private readonly deps: {
      getRecord: (runId: string) => { tabId?: number | undefined; trace: RuntimeEvent[] } | undefined;
      getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
      deletePendingAction: (requestId: string) => void;
      createContentRpcClient: (tabId: number) => ContentRpcClient;
      appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
      setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
      getSnapshot: (runId: string) => RunSnapshot;
      snapshotToolResult?: typeof snapshotToolResult;
    }
  ) {}

  async onApproved(input: { runId: string; requestId: string; tool: string }): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    if (record) {
      this.deps.appendTrace(record, {
        runId: input.runId,
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: {
          requestId: input.requestId,
          reason: 'Storage mutation approval granted',
          code: ERROR_CODES.OK
        }
      });
    }

    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);
    const result = record?.tabId
      ? await this.executeApprovedStorageMutation(input.tool, pendingAction, this.deps.createContentRpcClient(record.tabId))
      : failure('Storage approval has no active tab');

    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: result.ok ? 'observed' : 'error',
      pendingApproval: undefined,
      toolResult: (this.deps.snapshotToolResult ?? snapshotToolResult)(input.tool, result),
      trace: record?.trace ?? [],
      ...(result.ok ? {} : {
        error: { code: result.code, message: result.error?.message ?? result.summary }
      })
    });
    return result;
  }

  onDenied(): ToolResult {
    return {
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL,
      summary: 'User denied storage mutation approval',
      changedPage: false,
      requiresObserve: false,
      error: { message: 'User denied storage mutation approval' }
    };
  }

  private async executeApprovedStorageMutation(
    tool: string,
    pendingAction: ExecuteToolInput | undefined,
    rpc: ContentRpcClient
  ): Promise<ToolResult> {
    const action = storageMutationActionFromPendingAction(tool, pendingAction);
    if (!action) {
      return failure(`Storage approval is missing valid arguments for ${tool}`);
    }
    const response = await rpc.request(storageMutationMessage(action));
    if (!response.ok) {
      return failure(response.message);
    }
    if (!('storageMutation' in response)) {
      return failure('Storage mutation response is unavailable');
    }
    return success(response.storageMutation);
  }
}

function storageMutationActionFromPendingAction(
  tool: string,
  pendingAction: ExecuteToolInput | undefined
): StorageMutationAction | undefined {
  const args = pendingAction?.args;
  if (!isRecord(args) || !isStorageArea(args.area)) {
    return undefined;
  }
  if (tool === TOOL_NAMES.STORAGE_SET_WITH_APPROVAL && typeof args.key === 'string' && typeof args.value === 'string') {
    return { operation: 'set', area: args.area, key: args.key, value: args.value };
  }
  if (tool === TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL && typeof args.key === 'string') {
    return { operation: 'delete', area: args.area, key: args.key };
  }
  if (tool === TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL) {
    return { operation: 'clear', area: args.area };
  }
  return undefined;
}

function storageMutationMessage(action: StorageMutationAction) {
  if (action.operation === 'set') {
    return {
      type: CONTENT_RPC_MESSAGES.STORAGE_SET,
      area: action.area,
      key: action.key,
      value: action.value
    };
  }
  if (action.operation === 'delete') {
    return {
      type: CONTENT_RPC_MESSAGES.STORAGE_DELETE,
      area: action.area,
      key: action.key
    };
  }
  return {
    type: CONTENT_RPC_MESSAGES.STORAGE_CLEAR,
    area: action.area
  };
}

function success(mutation: StorageMutationResult): ToolResult {
  const target = mutation.key ? `${mutation.area}.${mutation.key}` : mutation.area;
  const summary = `Storage ${mutation.operation} completed for ${target}.`;
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data: {
      storageMutation: mutation
    },
    changedPage: true,
    requiresObserve: true,
    context: {
      visibility: 'summary',
      summary
    }
  };
}

function failure(message: string): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.TOOL_EXECUTION_FAILED,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message },
    context: {
      visibility: 'summary',
      summary: `${ERROR_CODES.TOOL_EXECUTION_FAILED}: ${message}`
    }
  };
}

function isStorageArea(value: unknown): value is StorageArea {
  return value === 'localStorage' || value === 'sessionStorage';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
