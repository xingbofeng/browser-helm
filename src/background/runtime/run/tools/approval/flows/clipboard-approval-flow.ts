import type { RuntimeEvent, ExecuteToolInput, RunSnapshot } from '../../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../../shared/constants/tool-names';
import { snapshotToolResult } from '../../../run-snapshot-assembler';
import type { ToolApprovalFlow } from './tool-approval-flow';
import {
  defaultClipboardManager,
  type ClipboardManagerLike
} from '../../../../../clipboard-manager';

export class ClipboardApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;
  private readonly clipboardManager: ClipboardManagerLike;

  constructor(
    private readonly deps: {
      getRecord: (runId: string) => { trace: RuntimeEvent[] } | undefined;
      getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
      deletePendingAction: (requestId: string) => void;
      appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
      setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
      getSnapshot: (runId: string) => RunSnapshot;
      snapshotToolResult?: typeof snapshotToolResult;
      clipboardManager?: ClipboardManagerLike | undefined;
    }
  ) {
    this.clipboardManager = deps.clipboardManager ?? defaultClipboardManager;
  }

  async onApproved(input: { runId: string; requestId: string; tool: string }): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);

    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);

    const result = await this.executeApprovedClipboardAction(input.tool, pendingAction);
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
      summary: 'User denied clipboard approval',
      changedPage: false,
      requiresObserve: false,
      error: { message: 'User denied clipboard approval' }
    };
  }

  private async executeApprovedClipboardAction(
    tool: string,
    pendingAction: ExecuteToolInput | undefined
  ): Promise<ToolResult> {
    try {
      if (tool === TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL) {
        const text = readTextArg(pendingAction?.args);
        if (text === undefined) {
          return failure('Clipboard write approval is missing text argument');
        }
        const written = await this.clipboardManager.writeText(text);
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: `Wrote ${written.textLength} characters to clipboard after approval.`,
          data: {
            operation: 'write',
            textLength: written.textLength,
            changedClipboard: written.changedClipboard
          },
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: `Clipboard write completed after approval (${written.textLength} characters).`
          }
        };
      }
      if (tool === TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL) {
        const read = await this.clipboardManager.readText();
        const safeSummary = `Clipboard read completed after approval (${read.textLength} characters).`;
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: `Read ${read.textLength} characters from clipboard after approval.`,
          data: {
            operation: 'read',
            sensitiveText: read.text,
            textLength: read.textLength
          },
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: safeSummary
          }
        };
      }
      return failure(`Unsupported clipboard approval tool: ${tool}`);
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'clipboard_unavailable');
    }
  }
}

function readTextArg(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) {
    return undefined;
  }
  const text = (args as Record<string, unknown>).text;
  return typeof text === 'string' ? text : undefined;
}

function failure(message: string): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.CLIPBOARD_UNAVAILABLE,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message },
    context: {
      visibility: 'summary',
      summary: `${ERROR_CODES.CLIPBOARD_UNAVAILABLE}: ${message}`
    }
  };
}
