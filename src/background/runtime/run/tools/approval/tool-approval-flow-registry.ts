import type { ToolApprovalFlow } from './flows/tool-approval-flow';
import { DefaultApprovalFlow, ExecutePendingActionApprovalFlow } from './flows/default-approval-flow';
import { FormSubmitApprovalFlow } from './flows/form-submit-approval-flow';
import { WorkflowReplayApprovalFlow } from './flows/workflow-replay-approval-flow';
import { ClipboardApprovalFlow } from './flows/clipboard-approval-flow';
import { StorageApprovalFlow } from './flows/storage-approval-flow';
import { TOOL_NAMES } from '../../../../../shared/constants/tool-names';
import type { ContentRpcClient } from '../../../../../page/messaging/content-rpc-client';
import type { RuntimeEvent, ExecuteToolInput } from '../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import type { RunSnapshot } from '../../../../../runtime/runtime-messages';
import type { ToolRouter } from '../../../../../tools/core/tool-router';
import type { RunMode } from '../../../../../shared/schemas/tool.schema';
import type { ClipboardManagerLike } from '../../../../clipboard-manager';

export type FlowDeps = {
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[] } | undefined;
  getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
  deletePendingAction: (requestId: string) => void;
  createContentRpcClient: (tabId: number) => ContentRpcClient;
  createToolRouter: (tabId: number) => ToolRouter;
  executeTool: (input: ExecuteToolInput) => Promise<ToolResult>;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  getSnapshot: (runId: string) => RunSnapshot;
  snapshotFromObserveResult: (runId: string, mode: RunMode, result: ToolResult, trace: RuntimeEvent[]) => RunSnapshot;
  clipboardManager?: ClipboardManagerLike | undefined;
};

export class ToolApprovalFlowRegistry {
  private readonly flows = new Map<string, ToolApprovalFlow>();
  private readonly defaultFlow: ToolApprovalFlow;

  constructor(deps: FlowDeps) {
    this.defaultFlow = new DefaultApprovalFlow();
    this.flows.set(TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL, new FormSubmitApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.FLOW_RUN_WITH_APPROVAL, new WorkflowReplayApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL, new ClipboardApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL, new ClipboardApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.STORAGE_SET_WITH_APPROVAL, new StorageApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL, new StorageApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL, new StorageApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.ACTION_CLICK, new ExecutePendingActionApprovalFlow(deps));
    this.flows.set(TOOL_NAMES.POINTER_CLICK, new ExecutePendingActionApprovalFlow(deps));
  }

  getFlow(tool: string): ToolApprovalFlow {
    return this.flows.get(tool) ?? this.defaultFlow;
  }
}
