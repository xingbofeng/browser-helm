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
import type { SetDomainAdapterEnabledInput } from '../../runtime/runtime-messages';
import { ApprovalManager } from '../../runtime/approval/approval-manager';
import { ChromeSettingsStore } from '../../storage/chrome/chrome-settings-store';
import type { SettingsStore } from '../../storage/interfaces/settings-store';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES, TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { buildRunSummary } from '../../agent/memory/run-summary-builder';
import { buildWorkflowDraft } from '../../agent/memory/plan-to-workflow-draft';
import { defaultMemoryRepo } from '../../storage/memory-repo';
import { defaultWorkflowRepo } from '../../storage/workflow-repo';
import { createToolRegistry } from '../../tools';
import { ToolRouter } from '../../tools/core/tool-router';
import { toolRequiresExplicitDomainConsent } from '../../tools/core/tool-selector';
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
  buildDomainAdapterSnapshot,
  snapshotFromObserveResult,
  snapshotToolResult
} from './run/run-snapshot-assembler';
import { RunStore } from './run/run-store';
import type { RunManagerDeps, RunRecord } from './run/runtime-service-types';
import { approvalRequestForTrace } from './run/runtime-event-utils';
import { createDefaultRunSessionPersistence } from './run/session-persistence';
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
import { VisionClient } from '../../agent/model/vision-client';
import {
  evaluateBrowserHelmDomainPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';

export class RunManager {
  private readonly store: RunStore;
  private readonly settingsStore: SettingsStore;
  private readonly lifecycle: RunLifecycleService;
  private readonly tools: ToolExecutionService;
  private readonly approvals: ApprovalService;

  constructor(private readonly deps: RunManagerDeps = {}) {
    this.store = new RunStore({
      sessionPersistence: deps.runSessionPersistence ?? createDefaultRunSessionPersistence()
    });
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
      executeTool: async (input) => await this.executeTool(input)
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
      approvalRequiredResultFn: approvalRequiredResult,
      createVisionClient: async () => await this.createVisionClient()
    });
    const flowRegistry = new ToolApprovalFlowRegistry({
      getRecord: (runId) => this.store.getRecord(runId),
      getPendingAction: (requestId) => this.store.getPendingApprovalAction(requestId),
      deletePendingAction: (requestId) => this.store.deletePendingApprovalAction(requestId),
      createContentRpcClient: (tabId) => this.createContentRpcClient(tabId),
      createToolRouter: (tabId) => this.createToolRouter(tabId),
      executeTool: async (input) => await this.tools.execute(input),
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
    return enrichSnapshotWithMemoryReuse({
      ...snapshot,
      ...(record?.tabId ? { targetTabId: record.tabId } : {}),
      ...(record?.taskState ? { taskState: record.taskState } : {})
    }, record);
  }

  cancelRun(runId: string): Promise<{ runId: string; status: 'cancelled' }> {
    return Promise.resolve(this.lifecycle.cancelRun(runId));
  }

  reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    return Promise.resolve(this.lifecycle.reviseGoal(input));
  }

  executeTool(input: ExecuteToolInput): Promise<ToolResult> {
    return this.executeToolWithAdapterSettings(input);
  }

  private async executeToolWithAdapterSettings(input: ExecuteToolInput): Promise<ToolResult> {
    await this.settingsStore.getDomainAdapterSettings?.();
    const domainGateResult = await this.domainConsentGateResult(input);
    if (domainGateResult) {
      return domainGateResult;
    }
    return await this.tools.execute(input);
  }

  private async domainConsentGateResult(input: ExecuteToolInput): Promise<ToolResult | undefined> {
    if (typeof this.settingsStore.getDomainPolicy !== 'function') {
      return undefined;
    }
    const record = this.store.getRecord(input.runId);
    if (!record?.tabId) {
      return undefined;
    }
    const contract = this.createToolRouter(record.tabId).getToolContract(input.tool, record.mode);
    if (!contract || !toolRequiresExplicitDomainConsent(contract)) {
      return undefined;
    }
    const snapshot = this.store.getSnapshot(input.runId);
    const domain = snapshot.observation?.currentDomain;
    const policy = await this.settingsStore.getDomainPolicy();
    const decision = evaluateDomainConsent(domain, policy);
    if (decision.allowed) {
      return undefined;
    }
    const code = decision.reason ?? 'DOMAIN_NOT_ENABLED';
    const result: ToolResult = {
      ok: false,
      code,
      summary: `Domain ${domain ?? 'unknown'} is not enabled for mutating or diagnostic hook tools`,
      changedPage: false,
      requiresObserve: false,
      error: {
        message: `Enable ${domain ?? 'this domain'} before running ${input.tool}`
      }
    };
    this.store.appendTrace(record, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: input.tool,
        ok: false,
        code,
        summary: result.summary,
        changedPage: false,
        requiresObserve: false
      }
    });
    this.store.setSnapshot(input.runId, {
      ...snapshot,
      status: 'waiting_for_user',
      toolResult: snapshotToolResult(input.tool, result),
      trace: record.trace
    });
    return result;
  }

  async setDomainAdapterEnabled(input: SetDomainAdapterEnabledInput): Promise<RunSnapshot> {
    const settings = await this.settingsStore.setDomainAdapterEnabled?.(input.adapterId, input.enabled);
    if (!settings) {
      throw new Error('Domain adapter settings store is unavailable');
    }
    const snapshot = this.store.getSnapshot(input.runId);
    const nextSnapshot: RunSnapshot = {
      ...snapshot,
      ...(snapshot.observation?.url
        ? { domainAdapter: buildDomainAdapterSnapshot(snapshot.observation.url) }
        : {})
    };
    this.store.setSnapshot(input.runId, nextSnapshot);
    this.store.notifySnapshotUpdated(input.runId);
    return this.getSnapshot(input.runId);
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
        summary: t('runtime.error.highlightUnavailable', 'zh'),
        changedPage: false,
        requiresObserve: false,
        error: {
          message: t('runtime.error.highlightUnavailable', 'zh'),
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

  private async createVisionClient(): Promise<VisionClient | undefined> {
    const settings = await this.settingsStore.getProviderSettings();
    if (!settings?.apiKey || !settings.model.trim()) {
      return undefined;
    }
    const modelClient = this.deps.createProviderModelClient?.({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model
    }) ?? createProviderClient({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      ...(settings.allowLocalProviderEndpoints === undefined ? {} : {
        allowLocalProviderEndpoints: settings.allowLocalProviderEndpoints
      })
    });
    return new VisionClient(modelClient);
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
      upsertToolStatusMessage(
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

function enrichSnapshotWithMemoryReuse(snapshot: RunSnapshot, record: RunRecord | undefined): RunSnapshot {
  const domain = snapshot.observation?.currentDomain;
  if (!domain) {
    return snapshot;
  }
  const workflowPreviews = record
    ? defaultWorkflowRepo.lookup({ domain, query: record.task, limit: 3 })
      .flatMap((workflow) => {
        const preview = defaultWorkflowRepo.preview(workflow.id);
        return preview ? [preview] : [];
      })
    : [];
  const workflowDraft = record && snapshot.status === 'finished'
    ? buildWorkflowDraft({
      domain,
      runSummary: buildRunSummary({
        runId: snapshot.runId,
        task: record.task,
        trace: record.trace,
        snapshot
      })
    })
    : undefined;

  return {
    ...snapshot,
    memory: {
      domain,
      entries: defaultMemoryRepo.list(domain),
      ...(workflowPreviews.length ? { workflowPreviews } : {})
    },
    ...(workflowDraft ? { workflowDraft } : {})
  };
}

function upsertToolStatusMessage(messages: AgentMessage[], message: AgentMessage): void {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      ...message,
      createdAt: messages[index]?.createdAt ?? message.createdAt
    };
    return;
  }
  const replyIndex = messages.findIndex((item) =>
    runIdFromMessageId(item.id) === runIdFromMessageId(message.id) &&
    isCurrentRunReplyMessage(item)
  );
  if (replyIndex >= 0) {
    messages.splice(replyIndex, 0, message);
    return;
  }
  messages.push(message);
}

function isCurrentRunReplyMessage(message: AgentMessage): boolean {
  if (message.role !== 'agent') {
    return false;
  }
  if (
    message.kind === 'page_summary' ||
    message.id.includes(':tool-status:') ||
    message.id.endsWith(':observe-status')
  ) {
    return false;
  }
  return message.kind === 'recommendation' ||
    message.kind === 'error' ||
    message.id.endsWith(':agent-final') ||
    message.id.endsWith(':provider-response');
}

function runIdFromMessageId(id: string): string {
  const index = id.indexOf(':');
  return index >= 0 ? id.slice(0, index) : id;
}

function evaluateDomainConsent(
  domain: string | undefined,
  policy: BrowserHelmDomainPolicy | undefined
) {
  if (domain && isLoopbackOrLocalhost(domain)) {
    return { allowed: true, hostname: domain, restricted: false };
  }
  return evaluateBrowserHelmDomainPolicy(domain, {
    enabledDomains: policy?.enabledDomains ?? [],
    blockedDomains: policy?.blockedDomains,
    allowRestrictedDomains: policy?.allowRestrictedDomains,
    defaultEnabled: false
  });
}

function isLoopbackOrLocalhost(domain: string): boolean {
  const hostname = normalizeHostname(domain);
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');
}

function normalizeHostname(domain: string): string {
  try {
    return new URL(`http://${domain}`).hostname.toLowerCase();
  } catch {
    return domain.toLowerCase().replace(/^\.+|\.+$/gu, '').replace(/:\d+$/u, '');
  }
}
