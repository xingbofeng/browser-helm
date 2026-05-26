import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type {
  ContentRpcRequest,
  ContentRpcResponse
} from '../../page/messaging/content-rpc.schema';
import { ContextBuilder } from '../../agent/context/context-builder';
import { initializeGoalState } from '../../agent/goal/goal-state';
import { AgentLoop } from '../../agent/kernel/agent-loop';
import { DecisionParser } from '../../agent/parser/decision-parser';
import { buildPlanState } from '../../agent/planning/plan-builder';
import {
  buildDebugReport,
  buildFormDoctorFindings,
  buildPageHealthFindings
} from '../../agent/report/findings-report';
import { resolveRunMode } from '../../agent/modes/mode-system';
import { InMemoryTraceRecorder } from '../../storage/memory/in-memory-trace-recorder';
import { ChromeContentRpcClient } from '../../page/messaging/content-rpc-client';
import { buildStructuredPageData } from '../../page/structured/structured-page-data';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import {
  APPROVAL_EVENT_NAMES,
  CONTENT_RPC_MESSAGES,
  TRACE_EVENT_NAMES
} from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { buildUserFacingPageSummary } from '../../shared/page-summary';
import type { Observation } from '../../shared/schemas/observation.schema';
import type { DebugReport } from '../../shared/schemas/diagnosis.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { ApprovalManager } from '../../runtime/approval/approval-manager';
import { PolicyEngine } from '../../agent/policy/policy-engine';
import { RuntimeDiagnosticModelClient } from './runtime-diagnostic-model-client';
import { createProviderClient } from './provider-client-factory';
import { resolveRuntimeCapabilities } from '../../runtime/capabilities/runtime-capabilities';
import { redactToolArgs } from '../../tools/core/tool-args-redaction';
import { ToolRouter } from '../../tools/core/tool-router';
import {
  approvalRequiredResult,
  userDeniedApprovalResult
} from '../../tools/core/tool-result-factory';
import { createToolRegistry } from '../../tools';
import type {
  DecideApprovalInput,
  ExecuteToolInput,
  HighlightRefInput,
  RuntimeProviderTestResult,
  RunSnapshot,
  RuntimeEvent,
  ReviseGoalInput,
  StartRunInput,
  TestProviderSettingsInput
} from '../../runtime/runtime-messages';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { TraceEvent } from '../../shared/schemas/trace.schema';
import type {
  AgentMessage,
  StreamingState
} from '../../shared/schemas/agent-message.schema';
import type { SettingsStore } from '../../storage/interfaces/settings-store';
import type { ModelClient, ModelOutput } from '../../agent/model/model-client';
import { ChromeSettingsStore } from '../../storage/chrome/chrome-settings-store';
import {
  maskProviderSecret,
  sanitizeSensitiveDetail
} from '../../shared/redaction';

type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
  settingsStore?: SettingsStore;
  createProviderModelClient?: (settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient;
};

type RunRecord = {
  task: string;
  mode: RunMode;
  tabId?: number | undefined;
  trace: RuntimeEvent[];
  skipProviderResponse?: boolean | undefined;
};

export class RunManager {
  private nextId = 1;
  private readonly approvalManager = new ApprovalManager();
  private readonly policyEngine = new PolicyEngine();
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly providerMessageRunIds = new Set<string>();
  private readonly records = new Map<
    string,
    RunRecord
  >();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly settingsStore: SettingsStore;

  constructor(private readonly deps: RunManagerDeps = {}) {
    this.settingsStore = deps.settingsStore ?? new ChromeSettingsStore();
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `run_${this.nextId}`;
    this.nextId += 1;
    const resolvedMode = resolveRunMode({
      task: input.task,
      ...(input.mode ? { explicitMode: input.mode } : {})
    });
    const mode = resolvedMode.mode;
    const record: RunRecord = {
      task: input.task,
      mode,
      trace: [],
      skipProviderResponse: input.skipProviderResponse
    };
    this.records.set(runId, record);
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: {
        task: input.task,
        mode
      }
    });
    this.snapshots.set(runId, {
      runId,
      mode,
      status: 'observing',
      classification: resolvedMode.classification,
      modeReason: resolvedMode.reason,
      messages: initialMessages(runId, input.task, {
        includeUserTask: input.skipProviderResponse !== true,
        includeObserveStatus: input.skipProviderResponse === true
      }),
      streaming: emptyStreamingState(),
      trace: record.trace
    });

    const tabId = input.tabId ?? (await this.getActiveTabId());
    if (!tabId) {
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: {
          code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          summary: 'No active browser tab is available'
        }
      });
      this.snapshots.set(runId, {
        runId,
        mode,
        status: 'error',
        refs: [],
        error: {
          code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          message: 'No active browser tab is available'
        },
        messages: [
          ...initialMessages(runId, input.task, {
            includeUserTask: input.skipProviderResponse !== true,
            includeObserveStatus: input.skipProviderResponse === true
          }),
          errorMessage(runId, '没有可用的活动标签页', 'No active browser tab is available')
        ],
        streaming: emptyStreamingState(),
        trace: record.trace
      });
      return { runId };
    }

    record.tabId = tabId;
    void this.observeInitial(runId, record, tabId);
    return { runId };
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  private async observeInitial(
    runId: string,
    record: RunRecord,
    tabId: number
  ): Promise<void> {
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        args: {}
      }
    });
    const router = this.createToolRouter(tabId);
    let result: ToolResult;
    try {
      result = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId, stepId: `${runId}:observe`, runMode: record.mode }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial observation failed';
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_FAILED,
        payload: {
          code: ERROR_CODES.RUNTIME_UNAVAILABLE,
          summary: message
        }
      });
      this.snapshots.set(runId, {
        ...this.getSnapshot(runId),
        status: 'error',
        refs: [],
        error: {
          code: ERROR_CODES.RUNTIME_UNAVAILABLE,
          message
        },
        messages: [
          ...(this.getSnapshot(runId).messages ?? initialMessages(runId, record.task, {
            includeUserTask: record.skipProviderResponse !== true,
            includeObserveStatus: record.skipProviderResponse === true
          })),
          errorMessage(runId, '页面观察失败', message)
        ],
        streaming: streamingStateFromTrace(record.trace),
        trace: record.trace
      });
      return;
    }
    if (this.getSnapshot(runId).status === 'cancelled') {
      return;
    }
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve,
        requiresApproval: result.requiresApproval
      }
    });
    const baseSnapshot = this.withRunMessages(
      this.snapshotFromToolResult(runId, record.mode, result, record.trace),
      record
    );
    if (record.mode === 'form' || record.mode === 'debug') {
      this.snapshots.set(runId, baseSnapshot);
      let fallbackSnapshot: RunSnapshot;
      try {
        fallbackSnapshot = {
          ...baseSnapshot,
          ...fallbackV1SnapshotFields(record.mode, result),
          trace: record.trace,
          messages: this.withRunMessages(baseSnapshot, record).messages,
          streaming: streamingStateFromTrace(record.trace),
          canInterrupt: true,
          canReviseGoal: true
        };
        this.snapshots.set(runId, fallbackSnapshot);
      } catch {
        fallbackSnapshot = {
          ...baseSnapshot,
          trace: record.trace,
          canInterrupt: true,
          canReviseGoal: true
        };
        this.snapshots.set(runId, fallbackSnapshot);
      }
      if (!record.skipProviderResponse) {
        this.scheduleProviderMessage(runId, record, fallbackSnapshot);
      }
      void this.enrichSnapshotWithAgentDiagnostics(
        runId,
        record,
        tabId,
        result,
        baseSnapshot
      ).then((enriched) => {
        const newEvents = (enriched.trace ?? []).slice(record.trace.length);
        record.trace.push(...newEvents);
        const current = this.getSnapshot(runId);
        const activeProvider = current.streaming?.active === true;
        const nextSnapshot = {
          ...current,
          ...enriched,
          status: activeProvider ? current.status : enriched.status,
          trace: record.trace,
          messages: this.withRunMessages({
            ...enriched,
            messages: current.messages
          }, record).messages,
          streaming: streamingStateFromTrace(record.trace)
        };
        this.snapshots.set(runId, nextSnapshot);
        this.emitTraceEvents(runId, newEvents);
        if (!record.skipProviderResponse) {
          this.scheduleProviderMessage(runId, record, nextSnapshot);
        }
      }).catch(() => undefined);
      return;
    }
    let nextSnapshot: RunSnapshot;
    try {
      nextSnapshot = await this.enrichSnapshotWithAgentDiagnostics(
        runId,
        record,
        tabId,
        result,
        baseSnapshot
      );
    } catch {
      nextSnapshot = {
        ...baseSnapshot,
        ...fallbackV1SnapshotFields(record.mode, result),
        trace: record.trace,
        messages: this.withRunMessages(baseSnapshot, record).messages,
        streaming: streamingStateFromTrace(record.trace),
        canInterrupt: true,
        canReviseGoal: true
      };
    }
    this.snapshots.set(runId, nextSnapshot);
    if (!record.skipProviderResponse) {
      this.scheduleProviderMessage(runId, record, nextSnapshot);
    }
  }

  private scheduleProviderMessage(
    runId: string,
    record: {
      task: string;
      mode: RunMode;
      trace: RuntimeEvent[];
    },
    snapshot: RunSnapshot
  ): void {
    if (this.providerMessageRunIds.has(runId)) {
      return;
    }
    this.providerMessageRunIds.add(runId);
    void this.generateProviderMessage(runId, record, snapshot).catch((error) => {
      const message = error instanceof Error ? maskProviderSecret(error.message) : 'Model call failed';
      const current = this.getSnapshot(runId);
      this.snapshots.set(runId, {
        ...current,
        messages: [
          ...(current.messages ?? initialMessages(runId, record.task, {
            includeUserTask: false,
            includeObserveStatus: false
          })),
          errorMessage(runId, '模型调用失败', message)
        ],
        streaming: {
          enabled: false,
          active: false,
          chunkCount: 0,
          fallbackUsed: false,
          fallbackReason: message
        }
      });
    });
  }

  private withRunMessages(
    snapshot: RunSnapshot,
    record: {
      task: string;
      trace: RuntimeEvent[];
      skipProviderResponse?: boolean | undefined;
    }
  ): RunSnapshot {
    const observeOnly = record.skipProviderResponse === true;
    const existing = snapshot.messages ?? initialMessages(snapshot.runId, record.task, {
      includeUserTask: !observeOnly,
      includeObserveStatus: observeOnly
    });
    const messages = [...existing];
    completeObserveStatusMessage(messages);
    if (snapshot.observation && observeOnly) {
      upsertMessage(messages, pageSummaryMessage(snapshot.runId, snapshot.observation));
    }
    if (snapshot.debugReport) {
      upsertMessage(messages, diagnosisMessage(snapshot.runId, snapshot.debugReport));
    }
    if (snapshot.error) {
      upsertMessage(
        messages,
        errorMessage(snapshot.runId, '运行出错', snapshot.error.message)
      );
    }
    if (snapshot.toolResult && snapshot.toolResult.tool !== TOOL_NAMES.PAGE_OBSERVE) {
      upsertMessage(
        messages,
        agentStatusMessage(
          snapshot.runId,
          `工具 ${snapshot.toolResult.tool}`,
          snapshot.toolResult.summary
        )
      );
    }
    return {
      ...snapshot,
      messages,
      streaming: streamingStateFromTrace(record.trace)
    };
  }

  private async enrichSnapshotWithAgentDiagnostics(
    runId: string,
    record: {
      mode: RunMode;
      trace: RuntimeEvent[];
    },
    tabId: number,
    observeResult: ToolResult,
    snapshot: RunSnapshot
  ): Promise<RunSnapshot> {
    if (record.mode !== 'form' && record.mode !== 'debug') {
      return snapshot;
    }
    const traceRecorder = new InMemoryTraceRecorder();
    const rpc = new CachedObservationRpcClient(
      this.createContentRpcClient(tabId),
      observeResult
    );
    const agent = new AgentLoop({
      modelClient: new RuntimeDiagnosticModelClient(),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(createToolRegistry(rpc)),
      contextBuilder: new ContextBuilder(),
      traceRecorder
    });

    const result = await withTimeout(agent.run({
      task: snapshot.mode === 'form'
        ? '诊断当前表单状态'
        : snapshot.mode === 'debug'
          ? '检查当前页面健康状态'
          : '观察当前页面并准备诊断',
      mode: record.mode,
      maxSteps: record.mode === 'form' || record.mode === 'debug' ? 3 : 1
    }), 1000);
    if (!result) {
      return {
        ...snapshot,
        ...fallbackV1SnapshotFields(record.mode, observeResult),
        trace: record.trace,
        canInterrupt: true,
        canReviseGoal: true
      };
    }
    const agentTrace = result.trace;
    const v1 = extractV1SnapshotFields(agentTrace);
    const normalizedAgentTrace = normalizeAgentTraceEvents(runId, agentTrace);
    for (const event of normalizedAgentTrace) {
      this.appendTrace(record, event);
    }

    return {
      ...snapshot,
      ...v1,
      trace: record.trace,
      canInterrupt: true,
      canReviseGoal: true
    };
  }

  private async generateProviderMessage(
    runId: string,
    record: {
      task: string;
      mode: RunMode;
      trace: RuntimeEvent[];
    },
    snapshot: RunSnapshot
  ): Promise<void> {
    const settings = await this.getProviderSettings();
    if (!settings?.apiKey?.trim() || !settings.baseUrl.trim() || !settings.model.trim()) {
      const nextSnapshot = this.withRunMessages(snapshot, record);
      const messages = [...(nextSnapshot.messages ?? [])];
      const now = Date.now();
      upsertMessage(messages, {
        id: `${runId}:provider-config-guide`,
        role: 'agent',
        kind: 'recommendation',
        status: 'complete',
        title: '请配置模型',
        content: '请先在右上角模型配置中填写 Base URL、API Key 和 Model。',
        createdAt: now,
        updatedAt: now
      });
      this.snapshots.set(runId, {
        ...nextSnapshot,
        messages,
        streaming: {
          enabled: false,
          active: false,
          chunkCount: 0,
          fallbackUsed: false
        }
      });
      this.notifySnapshotUpdated(runId);
      return;
    }

    let client: ModelClient;
    try {
      client = (this.deps.createProviderModelClient ?? createProviderClient)({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model
      });
    } catch (error) {
      const message = error instanceof Error ? maskProviderSecret(error.message) : 'Provider config invalid';
      const current = this.getSnapshot(runId);
      const nextSnapshot = this.withRunMessages({
        ...current,
        messages: [
          ...(current.messages ?? []),
          errorMessage(runId, '模型配置不可用', message)
        ]
      }, record);
      this.snapshots.set(runId, {
        ...nextSnapshot,
        streaming: {
          enabled: settings.streamingEnabled ?? true,
          active: false,
          provider: providerLabel(settings.baseUrl),
          model: settings.model,
          chunkCount: 0,
          fallbackUsed: false,
          fallbackReason: message
        }
      });
      return;
    }

    const messageId = `${runId}:provider-response`;
    const startedAt = Date.now();
    const statusBeforeProvider = snapshot.status;
    this.upsertProviderMessage(runId, record, {
      id: messageId,
      role: 'agent',
      kind: record.mode === 'ask' ? 'agent_status' : 'diagnosis',
      status: 'streaming',
      title: 'BrowserHelm',
      content: '',
      createdAt: startedAt,
      updatedAt: startedAt
    });
    this.setSnapshotStatus(runId, 'thinking');
    this.appendTrace(record, {
      runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
      timestamp: startedAt,
      payload: {
        provider: providerLabel(settings.baseUrl),
        model: settings.model,
        streamingEnabled: settings.streamingEnabled ?? true
      }
    });
    this.refreshStreamingState(runId, record);

    const input = {
      runId,
      stepIndex: 0,
      responseFormat: 'text' as const,
      messages: [
        {
          role: 'system' as const,
          content: 'You are BrowserHelm. Answer the user in concise Chinese. Use only the provided page observation. Do not expose ref_id, raw JSON, trace payload, or secrets.'
        },
        {
          role: 'user' as const,
          content: providerPrompt(record.task, snapshot)
        }
      ]
    };

    this.appendTrace(record, {
      runId,
      type: 'model_prompt',
      timestamp: Date.now(),
      payload: {
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        totalChars: input.messages.reduce((sum, m) => sum + m.content.length, 0)
      }
    });

    let text = '';
    let chunkCount = 0;
    try {
      let output: ModelOutput;
      if ((settings.streamingEnabled ?? true) && client.streamComplete) {
        try {
          output = await client.streamComplete(input, {
            onDelta: (delta) => {
              if (this.getSnapshot(runId).status === 'cancelled') {
                return;
              }
              chunkCount += 1;
              text += maskProviderSecret(delta);
              this.appendTrace(record, {
                runId,
                type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
                timestamp: Date.now(),
                payload: {
                  chunkCount,
                  charCount: delta.length,
                  preview: maskProviderSecret(delta).slice(0, 120)
                }
              });
              this.upsertProviderMessage(runId, record, {
                id: messageId,
                role: 'agent',
                kind: record.mode === 'ask' ? 'agent_status' : 'diagnosis',
                status: 'streaming',
                title: 'BrowserHelm',
                content: text,
                createdAt: startedAt,
                updatedAt: Date.now()
              });
              this.refreshStreamingState(runId, record);
            }
          });
        } catch (streamError) {
          if (this.getSnapshot(runId).status === 'cancelled') {
            return;
          }
          const reason = streamError instanceof Error
            ? maskProviderSecret(streamError.message)
            : 'Model streaming failed';
          this.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
            timestamp: Date.now(),
            payload: {
              message: reason,
              chunkCount
            }
          });
          this.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
            timestamp: Date.now(),
            payload: {
              reason: `stream_failed: ${reason}`
            }
          });
          output = await client.complete(input);
          text = maskProviderSecret(output.text);
          this.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
            timestamp: Date.now(),
            payload: {
              charCount: text.length
            }
          });
        }
      } else {
        this.appendTrace(record, {
          runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
          timestamp: Date.now(),
          payload: {
            reason: 'streaming_disabled'
          }
        });
        output = await client.complete(input);
        text = maskProviderSecret(output.text);
        this.appendTrace(record, {
          runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
          timestamp: Date.now(),
          payload: {
            charCount: text.length
          }
        });
      }
      if (this.getSnapshot(runId).status === 'cancelled') {
        return;
      }
      if (!text) {
        text = maskProviderSecret(output.text);
      }
      const finishedAt = Date.now();
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED,
        timestamp: finishedAt,
        payload: {
          chunkCount,
          charCount: text.length,
          model: settings.model,
          finalPreview: text.slice(0, 240)
        }
      });
      this.upsertProviderMessage(runId, record, {
        id: messageId,
        role: 'agent',
        kind: record.mode === 'ask' ? 'agent_status' : 'diagnosis',
        status: 'complete',
        title: 'BrowserHelm',
        content: text,
        createdAt: startedAt,
        updatedAt: finishedAt
      });
      this.setSnapshotStatus(runId, statusBeforeProvider);
      this.refreshStreamingState(runId, record);
    } catch (error) {
      if (this.getSnapshot(runId).status === 'cancelled') {
        return;
      }
      const message = error instanceof Error ? maskProviderSecret(error.message) : 'Model streaming failed';
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
        timestamp: Date.now(),
        payload: {
          message,
          chunkCount
        }
      });
      this.upsertProviderMessage(runId, record, {
        id: messageId,
        role: 'agent',
        kind: 'error',
        status: 'error',
        title: '模型调用失败',
        content: message,
        createdAt: startedAt,
        updatedAt: Date.now()
      });
      this.setSnapshotStatus(runId, statusBeforeProvider);
      this.refreshStreamingState(runId, record);
    }
  }

  private upsertProviderMessage(
    runId: string,
    record: {
      task: string;
      trace: RuntimeEvent[];
    },
    message: AgentMessage
  ): void {
    const current = this.getSnapshot(runId);
    const next = this.withRunMessages(current, record);
    const messages = [...(next.messages ?? [])];
    upsertMessage(messages, message);
    this.snapshots.set(runId, {
      ...next,
      messages,
      streaming: streamingStateFromTrace(record.trace)
    });
    this.notifySnapshotUpdated(runId);
  }

  private refreshStreamingState(
    runId: string,
    record: {
      task: string;
      trace: RuntimeEvent[];
    }
  ): void {
    const current = this.getSnapshot(runId);
    this.snapshots.set(runId, {
      ...current,
      streaming: streamingStateFromTrace(record.trace)
    });
    this.notifySnapshotUpdated(runId);
  }

  private setSnapshotStatus(runId: string, status: RunSnapshot['status']): void {
    const current = this.getSnapshot(runId);
    this.snapshots.set(runId, {
      ...current,
      status
    });
    this.notifySnapshotUpdated(runId);
  }

  async highlightRef(input: HighlightRefInput): Promise<ToolResult> {
    const record = this.records.get(input.runId);
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

  async executeTool(input: ExecuteToolInput): Promise<ToolResult> {
    const record = this.records.get(input.runId);
    const redactedArgs = redactToolArgs(input.tool, input.args);
    if (this.getSnapshot(input.runId).status === 'cancelled') {
      return {
        ok: false,
        code: ERROR_CODES.RUN_CANCELLED,
        summary: 'Run was cancelled by the user',
        changedPage: false,
        requiresObserve: false,
        error: {
          message: 'Run was cancelled by the user'
        }
      };
    }
    if (!record?.tabId) {
      const result = userDeniedApprovalResult('Run is not available for tool execution');
      this.snapshots.set(input.runId, {
        runId: input.runId,
        mode: record?.mode ?? 'ask',
        status: 'error',
        refs: [],
        toolResult: snapshotToolResult(input.tool, result),
        error: {
          code: result.code,
          message: result.summary
        },
        trace: record?.trace ?? []
      });
      return result;
    }

    const router = this.createToolRouter(record.tabId);
    const contract = router.getToolContract(input.tool, record.mode);
    if (contract) {
      const policy = this.policyEngine.evaluate({
        risk: contract.risk,
        wouldRequireApproval: false
      });
      if (!policy.allow && policy.requiresApproval) {
        const result = approvalRequiredResult({
          reason: policy.reason,
          risk: contract.risk,
          actionPreview: `${contract.title} (${input.tool})`
        });
        const request = this.approvalManager.create({
          runId: input.runId,
          stepId: `${input.runId}:${input.tool}`,
          tool: input.tool,
          argsPreview: redactedArgs,
          risk: contract.risk,
          reason: result.approval?.reason ?? result.summary,
          actionPreview: result.approval?.actionPreview
        });
        this.appendTrace(record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
          payload: {
            request,
            summary: `${request.reason}; action was not executed`
          }
        });
        this.snapshots.set(input.runId, {
          ...this.getSnapshot(input.runId),
          status: 'waiting_for_approval',
          toolResult: snapshotToolResult(input.tool, result),
          pendingApproval: request,
          trace: record.trace
        });
        return result;
      }
    }

    this.appendTrace(record, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: {
        tool: input.tool,
        args: redactedArgs
      }
    });
    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: 'executing_tool',
      trace: record.trace
    });

    const result = await router.execute(
      {
        tool: input.tool,
        args: input.args
      },
      {
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        runMode: record.mode
      }
    );
    this.appendTrace(record, {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: input.tool,
        ok: result.ok,
        code: result.code,
        summary: result.summary,
        changedPage: result.changedPage,
        requiresObserve: result.requiresObserve,
        requiresApproval: result.requiresApproval
      }
    });

    if (result.requiresApproval) {
      const request = this.approvalManager.create({
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        tool: input.tool,
        argsPreview: redactedArgs,
        risk: result.approval?.risk ?? 'high',
        reason: result.approval?.reason ?? result.summary,
        actionPreview: result.approval?.actionPreview
      });
      this.appendTrace(record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
        payload: {
          request,
          summary: request.reason
        }
      });
      this.snapshots.set(input.runId, {
        ...this.getSnapshot(input.runId),
        status: 'waiting_for_approval',
        toolResult: snapshotToolResult(input.tool, result),
        pendingApproval: request,
        trace: record.trace
      });
      return result;
    }

    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: result.ok ? 'observed' : 'error',
      toolResult: snapshotToolResult(input.tool, result),
      pendingApproval: undefined,
      trace: record.trace,
      ...(result.ok
        ? {}
        : {
            error: {
              code: result.code,
              message: result.error?.message ?? result.summary
            }
          })
    });
    return result;
  }

  decideApproval(input: DecideApprovalInput): Promise<ToolResult> {
    const record = this.records.get(input.runId);
    const decidedAt = Date.now();
    const decision = this.approvalManager.decide({
      requestId: input.requestId,
      decision: input.decision,
      reason: input.reason,
      decidedAt
    });
    if (!decision.ok) {
      return Promise.resolve({
        ok: false,
        code: decision.code,
        summary: decision.message,
        error: {
          message: decision.message
        }
      });
    }

    if (input.decision === 'denied') {
      const result = userDeniedApprovalResult(input.reason ?? 'User denied approval');
      if (record) {
        this.appendTrace(record, {
          runId: input.runId,
          type: APPROVAL_EVENT_NAMES.DENIED,
          payload: {
            requestId: input.requestId,
            reason: input.reason ?? result.summary,
            code: result.code
          }
        });
      }
      this.snapshots.set(input.runId, {
        ...this.getSnapshot(input.runId),
        status: 'failed',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(decision.request.tool, result),
        trace: record?.trace ?? []
      });
      return Promise.resolve(result);
    }

    const result: ToolResult = {
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'Approval recorded; no action was automatically executed in this version.',
      changedPage: false,
      requiresObserve: false
    };
    if (record) {
      this.appendTrace(record, {
        runId: input.runId,
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: {
          requestId: input.requestId,
          reason: result.summary,
          code: result.code
        }
      });
    }
    this.snapshots.set(input.runId, {
      ...this.getSnapshot(input.runId),
      status: 'observed',
      pendingApproval: undefined,
      toolResult: snapshotToolResult(decision.request.tool, result),
      trace: record?.trace ?? []
    });
    return Promise.resolve(result);
  }

  cancelRun(runId: string): Promise<{ runId: string; status: 'cancelled' }> {
    const current = this.getSnapshot(runId);
    const record = this.records.get(runId);
    if (record) {
      this.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.RUN_CANCELLED,
        payload: {
          reason: 'user_cancelled'
        }
      });
    }
    const snapshot: RunSnapshot = {
      ...current,
      status: 'cancelled',
      pendingApproval: undefined,
      messages: [
        ...(current.messages ?? initialMessages(runId, record?.task ?? current.runId, {
          includeUserTask: record?.skipProviderResponse !== true,
          includeObserveStatus: record?.skipProviderResponse === true
        })),
        errorMessage(runId, '运行已取消', '用户已取消当前 BrowserHelm run。')
      ],
      streaming: streamingStateFromTrace(record?.trace ?? current.trace ?? []),
      trace: record?.trace ?? current.trace
    };
    this.snapshots.set(runId, snapshot);
    return Promise.resolve({
      runId,
      status: 'cancelled'
    });
  }

  reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    const current = this.getSnapshot(input.runId);
    const record = this.records.get(input.runId);
    const mode = record?.mode ?? current.mode;
    const goal = initializeGoalState({
      task: input.goal,
      mode,
      goal: input.goal,
      ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
    });
    const plan = buildPlanState({
      id: `plan_${input.runId}_revised`,
      mode,
      task: input.goal,
      updatedAt: Date.now()
    });
    const event: RuntimeEvent = {
      runId: input.runId,
      type: TRACE_EVENT_NAMES.PLAN_UPDATED,
      payload: {
        goal,
        plan,
        reason: 'goal_revised'
      }
    };
    if (record) {
      this.appendTrace(record, event);
    }
    const snapshot: RunSnapshot = {
      ...current,
      mode,
      goal,
      plan,
      canInterrupt: true,
      canReviseGoal: true,
      trace: record?.trace ?? [...(current.trace ?? []), event]
    };
    this.snapshots.set(input.runId, snapshot);
    return Promise.resolve(snapshot);
  }

  async testProviderSettings(
    input: TestProviderSettingsInput
  ): Promise<RuntimeProviderTestResult> {
    try {
      if (!input.apiKey?.trim()) {
        return {
          ok: false,
          code: ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          message: 'Provider API Key is not configured',
          supportsStreaming: false,
          model: input.model
        };
      }
      const client = createProviderClient({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model
      });
      return await client.testConnection();
    } catch (error) {
      return {
        ok: false,
        code: ERROR_CODES.MODEL_REQUEST_FAILED,
        message: error instanceof Error
          ? maskProviderSecret(error.message)
          : 'Provider test failed',
        supportsStreaming: false,
        model: input.model
      };
    }
  }

  getSnapshot(runId: string): RunSnapshot {
    return (
      this.snapshots.get(runId) ?? {
        runId,
        mode: 'ask',
        status: 'not_found'
      }
    );
  }

  private createToolRouter(tabId: number): ToolRouter {
    const rpc = this.createContentRpcClient(tabId);
    return new ToolRouter(createToolRegistry(rpc));
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

  private async getProviderSettings() {
    return this.settingsStore.getProviderSettings();
  }

  private snapshotFromToolResult(
    runId: string,
    mode: RunMode,
    result: ToolResult,
    trace: RuntimeEvent[]
  ): RunSnapshot {
    const toolResult = {
      tool: TOOL_NAMES.PAGE_OBSERVE,
      ok: result.ok,
      code: result.code,
      summary: result.summary
    };

    if (!result.ok) {
      return {
        runId,
        mode,
        status: 'error',
        refs: [],
        toolResult,
        error: {
          code: result.code,
          message: result.error?.message ?? result.summary
        },
        trace
      };
    }

    const observation = result.data as Observation;
    const refs = observation.refSummary;
    const structuredPageData = buildStructuredPageData(observation);
    return {
      runId,
      mode,
      status: refs.length > 0 ? 'observed' : 'empty',
      observation: {
        url: observation.url,
        title: observation.title,
        currentDomain: observation.currentDomain,
        origin: observation.origin,
        visibleTextSummary: observation.visibleTextSummary,
        pageStateSummary: observation.pageStateSummary,
        interactiveCount: refs.length,
        warnings: observation.warnings
      },
      refs,
      structuredPageData,
      toolResult,
      trace
    };
  }

  private appendTrace(
    record: {
      trace: RuntimeEvent[];
    },
    event: RuntimeEvent
  ): void {
    record.trace.push(event);
    for (const listener of this.listeners.get(event.runId) ?? []) {
      listener(event);
    }
  }

  private emitTraceEvents(runId: string, events: RuntimeEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners.get(runId) ?? []) {
        listener(event);
      }
    }
  }

  private notifySnapshotUpdated(runId: string): void {
    const event: RuntimeEvent = {
      runId,
      type: 'snapshot_updated',
      timestamp: Date.now()
    };
    for (const listener of this.listeners.get(runId) ?? []) {
      listener(event);
    }
  }
}

class CachedObservationRpcClient implements ContentRpcClient {
  constructor(
    private readonly fallback: ContentRpcClient,
    private readonly observeResult: ToolResult
  ) {}

  request(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (
      message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE &&
      this.observeResult.ok &&
      typeof this.observeResult.data === 'object' &&
      this.observeResult.data !== null
    ) {
      return Promise.resolve({
        ok: true,
        observation: this.observeResult.data as Observation
      });
    }
    return this.fallback.request(message);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs);
    })
  ]);
}

function initialMessages(
  runId: string,
  task: string,
  options: {
    includeUserTask?: boolean | undefined;
    includeObserveStatus?: boolean | undefined;
  } = {}
): AgentMessage[] {
  const now = Date.now();
  const messages: AgentMessage[] = [];
  if (options.includeUserTask !== false) {
    messages.push({
      id: `${runId}:task`,
      role: 'user',
      kind: 'task',
      status: 'complete',
      content: task,
      createdAt: now,
      updatedAt: now
    });
  }
  if (options.includeObserveStatus) {
    messages.push({
      id: `${runId}:observe-status`,
      role: 'agent',
      kind: 'agent_status',
      status: 'streaming',
      title: '正在观察当前页面',
      content: 'BrowserHelm 正在读取当前页面摘要和可交互结构。',
      createdAt: now,
      updatedAt: now
    });
  }
  return messages;
}

function pageSummaryMessage(
  runId: string,
  observation: NonNullable<RunSnapshot['observation']>
): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:page-summary`,
    role: 'agent',
    kind: 'page_summary',
    status: 'complete',
    title: '页面摘要',
    content: buildUserFacingPageSummary({
      title: observation.title,
      currentDomain: observation.currentDomain,
      url: observation.url,
      pageStateSummary: observation.pageStateSummary,
      interactiveCount: observation.interactiveCount,
      warnings: observation.warnings
    }),
    createdAt: now,
    updatedAt: now
  };
}

function diagnosisMessage(runId: string, report: DebugReport): AgentMessage {
  const now = Date.now();
  const findingText = report.findings
    .map((finding) => finding.title)
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');
  return {
    id: `${runId}:diagnosis`,
    role: 'agent',
    kind: 'diagnosis',
    status: 'complete',
    title: report.title,
    content: findingText || '暂未发现高置信度问题。',
    createdAt: now,
    updatedAt: now
  };
}

function agentStatusMessage(runId: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:tool-status:${title}`,
    role: 'agent',
    kind: 'agent_status',
    status: 'complete',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}

function errorMessage(runId: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:error:${title}`,
    role: 'agent',
    kind: 'error',
    status: 'error',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}

function upsertMessage(messages: AgentMessage[], message: AgentMessage): void {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      ...message,
      createdAt: messages[index]?.createdAt ?? message.createdAt
    };
    return;
  }
  messages.push(message);
}

function completeObserveStatusMessage(messages: AgentMessage[]): void {
  const now = Date.now();
  const message = messages.find((item) => item.id.endsWith(':observe-status'));
  if (!message || message.status !== 'streaming') {
    return;
  }
  message.status = 'complete';
  message.title = '已完成页面观察';
  message.content = 'BrowserHelm 已完成当前页面摘要和可交互结构读取。';
  message.updatedAt = now;
}

function emptyStreamingState(): StreamingState {
  return {
    enabled: true,
    active: false,
    chunkCount: 0,
    fallbackUsed: false
  };
}

function streamingStateFromTrace(trace: RuntimeEvent[]): StreamingState {
  const streamStarted = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_STARTED);
  const streamFinished = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED);
  const fallbackStarted = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED);
  const fallbackFinished = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED);
  const failed = lastEvent(trace, TRACE_EVENT_NAMES.MODEL_STREAM_FAILED);
  const cancelled = lastEvent(trace, TRACE_EVENT_NAMES.RUN_CANCELLED);
  const deltaEvents = trace.filter((event) =>
    event.type === TRACE_EVENT_NAMES.MODEL_STREAM_DELTA
  );
  const startedPayload = payloadRecord(streamStarted?.payload);
  const finishedPayload = payloadRecord(streamFinished?.payload);
  const fallbackPayload = payloadRecord(fallbackStarted?.payload);
  const failedPayload = payloadRecord(failed?.payload);
  const lastDeltaPayload = payloadRecord(deltaEvents.at(-1)?.payload);
  const chunkCount = numberPayload(finishedPayload.chunkCount) ??
    numberPayload(failedPayload.chunkCount) ??
    numberPayload(lastDeltaPayload.chunkCount) ??
    deltaEvents.length;
  const provider = stringPayload(startedPayload.provider);
  const model = stringPayload(startedPayload.model) ?? stringPayload(finishedPayload.model);
  const finalText = stringPayload(finishedPayload.finalPreview);
  const fallbackReason = stringPayload(fallbackPayload.reason) ?? payloadSummary(failed?.payload);
  const cancelledAfterStart = isEventAfter(cancelled, streamStarted);
  return {
    enabled: startedPayload.streamingEnabled !== false,
    active: Boolean(streamStarted && !streamFinished && !failed && !fallbackFinished && !cancelledAfterStart),
    chunkCount,
    fallbackUsed: Boolean(fallbackStarted || fallbackFinished),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(failed || fallbackStarted ? { fallbackReason } : {}),
    ...(finalText ? { finalText } : {}),
    ...(streamStarted ? { startedAt: eventTimestamp(streamStarted) } : {}),
    ...(streamFinished ?? fallbackFinished ?? (cancelledAfterStart ? cancelled : undefined)
      ? { finishedAt: eventTimestamp((streamFinished ?? fallbackFinished ?? cancelled) as RuntimeEvent) }
      : {})
  };
}

function isEventAfter(event: RuntimeEvent | undefined, reference: RuntimeEvent | undefined): boolean {
  if (!event || !reference) {
    return false;
  }
  return (eventTimestamp(event) ?? 0) >= (eventTimestamp(reference) ?? 0);
}

function lastEvent(trace: RuntimeEvent[], type: string): RuntimeEvent | undefined {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    if (trace[index]?.type === type) {
      return trace[index];
    }
  }
  return undefined;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? maskProviderSecret(value) : undefined;
}

function numberPayload(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'stream_failed';
  }
  const record = payload as Record<string, unknown>;
  return typeof record.message === 'string'
    ? maskProviderSecret(record.message)
    : 'stream_failed';
}

function providerLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./u, '');
  } catch {
    return 'openai-compatible';
  }
}

function providerPrompt(task: string, snapshot: RunSnapshot): string {
  const observation = snapshot.observation;
  const summary = [
    `用户任务：${task}`,
    observation
      ? `当前页面：${observation.title} (来源：${providerPageSource(observation)})`
      : '当前页面：尚未获得页面摘要',
    observation?.visibleTextSummary
      ? `页面摘要：${observation.visibleTextSummary}`
      : undefined,
    observation?.pageStateSummary
      ? `页面状态：${observation.pageStateSummary}`
      : undefined,
    typeof observation?.interactiveCount === 'number'
      ? `可交互元素数量：${observation.interactiveCount}`
      : undefined,
    snapshot.structuredPageData?.forms.summary
      ? `表单摘要：${snapshot.structuredPageData.forms.summary}`
      : undefined,
    snapshot.structuredPageData?.interactive.summary
      ? `交互摘要：${snapshot.structuredPageData.interactive.summary}`
      : undefined
  ].filter(Boolean).join('\n');
  return `${summary}\n\n请基于这些信息给出面向真实用户的简短回答。`;
}

function providerPageSource(observation: NonNullable<RunSnapshot['observation']>): string {
  if (observation.currentDomain) {
    return observation.currentDomain;
  }
  try {
    return new URL(observation.url).hostname.replace(/^www\./u, '');
  } catch {
    return observation.origin || 'unknown';
  }
}

function eventTimestamp(event: RuntimeEvent): number | undefined {
  const record = event as RuntimeEvent & { timestamp?: unknown };
  return typeof record.timestamp === 'number' ? record.timestamp : undefined;
}

function fallbackV1SnapshotFields(
  mode: RunMode,
  observeResult: ToolResult
): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'findings'
  | 'debugReport'
> {
  const task = mode === 'form' ? '诊断当前表单状态' : '检查当前页面健康状态';
  const resolvedMode = resolveRunMode({
    task,
    explicitMode: mode
  });
  const capabilities = resolveRuntimeCapabilities({
    hasActiveTab: true,
    shallowDebugAvailable: true
  });
  const goal = initializeGoalState({
    task,
    mode
  });
  const plan = buildPlanState({
    id: `plan_fallback_${Date.now().toString(36)}`,
    mode,
    task,
    updatedAt: Date.now()
  });

  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'findings'
    | 'debugReport'
  > = {
    classification: resolvedMode.classification,
    modeReason: resolvedMode.reason,
    capabilities,
    capabilityLimitations: [],
    goal,
    plan
  };

  if (mode === 'form' && observeResult.ok) {
    const observation = observeResult.data as Observation;
    const formData = readFormDataFromObservation(observation);
    const findings = buildFormDoctorFindings(formData);
    fields.findings = findings;
    fields.debugReport = buildDebugReport({
      title: 'Form Doctor 诊断报告',
      findings,
      recommendations: findings.length > 0 ? ['根据 finding 的 evidence 逐项处理。'] : []
    });
  }
  if (mode === 'debug') {
    const observation = observeResult.ok ? observeResult.data as Observation : undefined;
    const pageHealth = observation?.pageHealth;
    const findings = pageHealth ? buildPageHealthFindings(pageHealth) : [];
    fields.debugReport = buildDebugReport({
      title: 'Page Inspector 诊断报告',
      findings,
      recommendations: findings.length > 0 ? ['根据 finding 的 evidence 逐项处理。'] : [],
      limitations: pageHealth?.limitations ?? ['暂未收集到可汇总的浅层 debug finding']
    });
    fields.findings = findings;
  }

  return fields;
}

function readFormDataFromObservation(observation: Observation): Parameters<
  typeof buildFormDoctorFindings
>[0] {
  const record =
    typeof observation.formFields === 'object' && observation.formFields !== null
      ? observation.formFields as Record<string, unknown>
      : {};
  return {
    fields: Array.isArray(record.fields) ? record.fields as never : [],
    submit:
      typeof record.submit === 'object' && record.submit !== null
        ? record.submit as never
        : undefined,
    warnings: Array.isArray(record.warnings) ? record.warnings as never : []
  };
}

function extractV1SnapshotFields(trace: TraceEvent[]): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'recovery'
  | 'findings'
  | 'debugReport'
> {
  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'recovery'
    | 'findings'
    | 'debugReport'
  > = {};

  for (const event of trace) {
    if (event.type === TRACE_EVENT_NAMES.TASK_CLASSIFIED) {
      fields.classification = event.payload.classification;
      fields.modeReason = event.payload.classification.reason;
    }
    if (event.type === TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED) {
      fields.capabilities = event.payload.capabilities;
      fields.capabilityLimitations = event.payload.limitations;
    }
    if (event.type === TRACE_EVENT_NAMES.PLAN_UPDATED) {
      fields.plan = event.payload.plan;
      if (event.payload.goal) {
        fields.goal = event.payload.goal;
      }
    }
    if (event.type === TRACE_EVENT_NAMES.RECOVERY_ACTION) {
      fields.recovery = event.payload.recovery;
    }
    if (event.type === TRACE_EVENT_NAMES.FINDINGS_REPORTED) {
      fields.findings = event.payload.findings;
    }
    if (event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED) {
      fields.debugReport = event.payload.report;
    }
  }

  return fields;
}

function normalizeAgentTraceEvents(runId: string, trace: TraceEvent[]): RuntimeEvent[] {
  return trace.map((event) => ({
    ...event,
    runId,
    payload: withAgentRunId(event.payload, event.runId)
  }));
}

function withAgentRunId(payload: unknown, agentRunId: string): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...payload,
      agentRunId
    };
  }
  return {
    value: payload,
    agentRunId
  };
}

function snapshotToolResult(
  tool: string,
  result: ToolResult
): NonNullable<RunSnapshot['toolResult']> {
  return {
    tool,
    ok: result.ok,
    code: result.code,
    summary: result.summary,
    detail: sanitizeToolResultDetail(result),
    changedPage: result.changedPage,
    requiresObserve: result.requiresObserve,
    requiresApproval: result.requiresApproval
  };
}

function sanitizeToolResultDetail(result: ToolResult): unknown {
  return sanitizeSensitiveDetail({
    data: result.data,
    error: result.error,
    approval: result.approval
  });
}
