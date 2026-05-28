import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ChromeContentRpcClient } from '../../page/messaging/content-rpc-client';
import type {
  DecideApprovalInput,
  ExecuteToolInput,
  HighlightRefInput,
  RuntimeEvent,
  RuntimeProviderTestResult,
  RunSnapshot,
  ReviseGoalInput,
  StartRunInput,
  TestProviderSettingsInput
} from '../../runtime/runtime-messages';
import { ApprovalManager } from '../../runtime/approval/approval-manager';
import { ChromeSettingsStore } from '../../storage/chrome/chrome-settings-store';
import type { SettingsStore } from '../../storage/interfaces/settings-store';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { createToolRegistry } from '../../tools';
import { ToolRouter } from '../../tools/core/tool-router';
import { approvalRequiredResult } from '../../tools/core/tool-result-factory';
import { RunLifecycleService } from './run/run-lifecycle-service';
import {
  completeObserveStatusMessage,
  diagnosisMessage,
  errorMessage,
  initialMessages,
  pageSummaryMessage,
  toolStatusMessage,
  upsertMessage
} from './run/run-message-presenter';
import {
  fallbackSnapshotFields,
  snapshotFromObserveResult,
  snapshotToolResult
} from './run/run-snapshot-assembler';
import { RunStore } from './run/run-store';
import type { RunManagerDeps, RunRecord } from './run/runtime-service-types';
import { approvalRequestForTrace } from './run/runtime-event-utils';
import { emptyStreamingState, streamingStateFromTrace } from './run/streaming-state';
import { ToolRuntimePolicy } from './run/tools/tool-runtime-policy';
import { ToolExecutionService } from './run/tools/tool-execution-service';
import { DefaultToolRuntimeAdapter } from './run/tools/adapters/default-tool-runtime-adapter';
import { FormToolRuntimeAdapter } from './run/tools/adapters/form-tool-runtime-adapter';
import { ToolApprovalFlowRegistry } from './run/tools/approval/tool-approval-flow-registry';
import { ApprovalService } from './run/tools/approval/approval-service';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import { createProviderClient } from './provider-client-factory';

export class RunManager {
  private readonly store = new RunStore();
  private readonly settingsStore: SettingsStore;
  private readonly lifecycle: RunLifecycleService;
  private readonly tools: ToolExecutionService;
  private readonly approvals: ApprovalService;

  constructor(private readonly deps: RunManagerDeps = {}) {
    this.settingsStore = deps.settingsStore ?? new ChromeSettingsStore();

    const approvalManager = new ApprovalManager();
    const withRunMessages = (
      snapshot: RunSnapshot,
      record: { task: string; trace: RuntimeEvent[]; runKind?: RunRecord['runKind']; locale?: Locale }
    ) => this.withRunMessages(snapshot, record);
    this.lifecycle = new RunLifecycleService({
      store: this.store,
      createToolRouter: (tabId) => this.createToolRouter(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      snapshotFromObserveResult,
      withRunMessages,
      fallbackSnapshotFields,
      streamingStateFromTrace,
      emptyStreamingState,
      settingsStore: this.settingsStore,
      createProviderModelClient: deps.createProviderModelClient,
      initialMessages,
      errorMessage,
      executeTool: async (input) => await this.tools.execute(input)
    });

    this.tools = new ToolExecutionService({
      getSnapshot: (runId) => this.store.getSnapshot(runId),
      getRecord: (runId) => this.store.getRecord(runId),
      createToolRouter: (tabId) => this.createToolRouter(tabId),
      createContentRpcClient: (tabId) => this.createContentRpcClient(tabId),
      appendTrace: (record, event) => this.store.appendTrace(record, event),
      setSnapshot: (runId, snapshot) => this.store.setSnapshot(runId, snapshot),
      setPendingAction: (requestId, input) => this.store.setPendingApprovalAction(requestId, input),
      snapshotToolResult,
      adapters: [
        new FormToolRuntimeAdapter(),
        new DefaultToolRuntimeAdapter()
      ],
      toolPolicy: new ToolRuntimePolicy(),
      approvalManager,
      approvalRequestForTrace,
      approvalRequiredResultFn: approvalRequiredResult
    });
    const flowRegistry = new ToolApprovalFlowRegistry({
      getRecord: (runId) => this.store.getRecord(runId),
      getPendingAction: (requestId) => this.store.getPendingApprovalAction(requestId),
      deletePendingAction: (requestId) => this.store.deletePendingApprovalAction(requestId),
      createContentRpcClient: (tabId) => this.createContentRpcClient(tabId),
      createToolRouter: (tabId) => this.createToolRouter(tabId),
      appendTrace: (record, event) => this.store.appendTrace(record, event),
      setSnapshot: (runId, snapshot) => this.store.setSnapshot(runId, snapshot),
      getSnapshot: (runId) => this.store.getSnapshot(runId),
      snapshotFromObserveResult
    });
    this.approvals = new ApprovalService({
      approvalManager,
      getRecord: (runId) => this.store.getRecord(runId),
      getSnapshot: (runId) => this.store.getSnapshot(runId),
      setSnapshot: (runId, snapshot) => this.store.setSnapshot(runId, snapshot),
      appendTrace: (record, event) => this.store.appendTrace(record, event),
      deletePendingAction: (requestId) => this.store.deletePendingApprovalAction(requestId),
      flowRegistry
    });
  }

  startRun(input: StartRunInput): Promise<{ runId: string }> {
    return this.lifecycle.startRun(input);
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    return this.store.subscribe(runId, listener);
  }

  getSnapshot(runId: string): RunSnapshot {
    const snapshot = this.store.getSnapshot(runId);
    const record = this.store.getRecord(runId);
    return {
      ...snapshot,
      ...(record?.tabId ? { targetTabId: record.tabId } : {}),
      ...(record?.taskState ? { taskState: record.taskState } : {})
    };
  }

  cancelRun(runId: string): Promise<{ runId: string; status: 'cancelled' }> {
    return Promise.resolve(this.lifecycle.cancelRun(runId));
  }

  reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    return Promise.resolve(this.lifecycle.reviseGoal(input));
  }

  executeTool(input: ExecuteToolInput): Promise<ToolResult> {
    return this.tools.execute(input);
  }

  decideApproval(input: DecideApprovalInput): Promise<ToolResult> {
    return this.approvals.decideApproval(input);
  }

  async highlightRef(input: HighlightRefInput): Promise<ToolResult> {
    const record = this.store.getRecord(input.runId);
    if (!record?.tabId) {
      return {
        ok: false,
        code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        summary: 'Run is not available for page element inspection',
        changedPage: false,
        requiresObserve: false,
        error: {
          message: 'Run is not available for page element inspection'
        }
      };
    }

    const response = await this.createContentRpcClient(record.tabId).request({
      type: CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF,
      refId: input.refId
    });
    if (!response.ok) {
      return {
        ok: false,
        code: response.code,
        summary: response.message,
        changedPage: false,
        requiresObserve: false,
        error: {
          message: response.message,
          detail: response.detail
        }
      };
    }
    const result: ToolResult = {
      ok: true,
      code: ERROR_CODES.OK,
      summary: `Highlighted page element ${input.refId}`,
      changedPage: false,
      requiresObserve: false
    };
    if ('ref' in response) {
      result.data = response.ref;
    }
    return result;
  }

  testProviderSettings(input: TestProviderSettingsInput): Promise<RuntimeProviderTestResult> {
    const client = createProviderClient({
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey ?? '',
      ...(input.allowLocalProviderEndpoints === undefined ? {} : { allowLocalProviderEndpoints: input.allowLocalProviderEndpoints })
    });
    return client.testConnection();
  }

  private createToolRouter(tabId: number): ToolRouter {
    return new ToolRouter(createToolRegistry(this.createContentRpcClient(tabId)));
  }

  private createContentRpcClient(tabId: number): ContentRpcClient {
    return this.deps.createContentRpcClient?.(tabId) ?? new ChromeContentRpcClient(tabId);
  }

  private async getActiveTabId(): Promise<number | undefined> {
    if (this.deps.getActiveTabId) {
      return this.deps.getActiveTabId();
    }
    if (!globalThis.chrome?.tabs?.query) {
      return undefined;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab?.id;
  }

  private withRunMessages(
    snapshot: RunSnapshot,
    record: { task: string; trace: RuntimeEvent[]; runKind?: RunRecord['runKind']; locale?: Locale }
  ): RunSnapshot {
    const observeOnly = record.runKind === 'observe_only';
    const locale = record.locale ?? 'zh';
    const existing = snapshot.messages ?? initialMessages(snapshot.runId, record.task, locale, {
      includeUserTask: !observeOnly,
      includeObserveStatus: observeOnly
    });
    const messages = [...existing];
    completeObserveStatusMessage(messages);
    if (snapshot.observation && observeOnly) {
      upsertMessage(messages, pageSummaryMessage(snapshot.runId, snapshot.observation, locale));
    }
    if (snapshot.debugReport) {
      upsertMessage(messages, diagnosisMessage(snapshot.runId, snapshot.debugReport, locale));
    }
    if (snapshot.error) {
      upsertMessage(messages, errorMessage(snapshot.runId, t('runtime.error.runError', locale), snapshot.error.message));
    }
    if (snapshot.toolResult && snapshot.toolResult.tool !== TOOL_NAMES.PAGE_OBSERVE) {
      upsertMessage(
        messages,
        toolStatusMessage(
          snapshot.runId,
          snapshot.toolResult.tool,
          snapshot.toolResult.summary,
          locale
        )
      );
    }
    const hasPageSummary = messages.some((message) => message.kind === 'page_summary');
    const displayMessages = hasPageSummary
      ? messages.filter((message) => !message.id.endsWith(':observe-status'))
      : messages;
    return {
      ...snapshot,
      messages: displayMessages,
      streaming: record.trace.some((event) => event.type.startsWith('model_stream_'))
        ? streamingStateFromTrace(record.trace)
        : snapshot.streaming
    };
  }
}
