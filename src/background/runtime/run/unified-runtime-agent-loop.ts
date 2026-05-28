import { DecisionParser } from '../../../agent/parser/decision-parser';
import type { ModelClient } from '../../../agent/model/model-client';
import type { SettingsStore } from '../../../storage/interfaces/settings-store';
import type { ExecuteToolInput, RunSnapshot, RuntimeEvent, RuntimeTaskState } from '../../../runtime/runtime-messages';
import type { RunRecord } from './runtime-service-types';
import { createProviderClient } from '../provider-client-factory';
import { ERROR_CODES } from '../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../shared/constants/event-names';
import { TOOL_NAMES } from '../../../shared/constants/tool-names';
import type { AgentDecision } from '../../../shared/schemas/agent-decision.schema';
import type { ModelMessage } from '../../../shared/schemas/model-message.schema';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import type { AgentMessage } from '../../../shared/schemas/agent-message.schema';
import { streamingStateFromTrace } from './streaming-state';
import {
  redactTextForModelContext,
  sanitizeSensitiveDetail
} from '../../../shared/redaction';
import type { Locale } from '../../../i18n/types';
import { t, tZh } from '../../../i18n/t';
import { modeSwitchRequestMessage } from './mode-switch-message';
import type { ToolPromptContract } from './runtime-service-types';
import { buildMessages, getPromptToolContracts } from './prompt-builder';
import {
  augmentRuntimeToolDecision,
  normalizeModelDecision,
  runtimeFormCandidates,
  validateRuntimeToolDecision,
  isFormFillTool
} from './form-fill-augmenter';
import {
  validateModelDecision,
  validateRepairDecision,
  isExistingValueOverwriteError,
  existingValueFinishMessage,
  buildRepairMessages
} from './decision-validator';
import type { ModelDecisionError } from './decision-validator';

// ── Runtime constants ──
const MAX_REPAIR_ATTEMPTS = 1;
const MODEL_DECISION_TIMEOUT_MS = 10 * 60 * 1000;
const MODEL_DECISION_TIMEOUT_MESSAGE = tZh('runtime.error.modelTimeout');
const MODEL_TIMEOUT = Symbol('model_timeout');
const MAX_TASK_STATE_ITEMS = 12;
const MAX_TASK_STATE_TEXT_CHARS = 160;

// ── Types ──

type UnifiedRuntimeAgentLoopDeps = {
  settingsStore: SettingsStore;
  createProviderModelClient?: ((settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient) | undefined;
  getSnapshot: (runId: string) => RunSnapshot;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  notifySnapshotUpdated: (runId: string) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  executeTool: (input: ExecuteToolInput) => Promise<unknown>;
  withRunMessages: (snapshot: RunSnapshot, record: RunRecord) => RunSnapshot;
  /** Returns available tool contracts for the current run mode. */
  getToolContracts: (runMode: RunMode) => ToolPromptContract[];
};

type UnifiedRuntimeAgentLoopInput = {
  runId: string;
  record: RunRecord & { tabId: number };
  maxSteps?: number | undefined;
};

// ── Class ──

export class UnifiedRuntimeAgentLoop {
  private readonly parser = new DecisionParser();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(private readonly deps: UnifiedRuntimeAgentLoopDeps) {}

  abortRun(runId: string): void {
    this.abortControllers.get(runId)?.abort();
    this.abortControllers.delete(runId);
  }

  async run(input: UnifiedRuntimeAgentLoopInput): Promise<RunSnapshot> {
    const settings = await this.deps.settingsStore.getProviderSettings();
    if (!settings?.baseUrl || !settings.apiKey || !settings.model) {
      const current = this.deps.getSnapshot(input.runId);
      const snapshot: RunSnapshot = {
        ...current,
        status: 'waiting_for_user',
        error: {
          code: ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          message: 'Provider settings are required for the unified agent loop'
        },
        streaming: {
          enabled: false,
          active: false,
          chunkCount: 0,
          fallbackUsed: false
        },
        trace: input.record.trace
      };
      this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
      return snapshot;
    }

    const client = (this.deps.createProviderModelClient ?? createProviderClient)({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model
    });
    const maxSteps = input.maxSteps ?? 6;
    const toolsContracts = getPromptToolContracts(
      this.deps.getToolContracts(input.record.mode),
      input.record.mode
    );
    const locale = input.record.locale ?? 'zh';

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      const current = this.deps.getSnapshot(input.runId);
      if (isTerminalStatus(current.status)) {
        return current;
      }

      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TURN_STARTED,
        payload: { stepIndex, maxSteps }
      });

      this.setSnapshot(input.runId, {
        ...current,
        status: 'thinking',
        trace: input.record.trace
      });

      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOLS_SELECTED,
        payload: {
          stepIndex,
          toolCount: toolsContracts.length,
          toolNames: toolsContracts.map((t) => t.name)
        }
      });

      const messages = buildMessages({
        record: input.record,
        snapshot: current,
        toolsContracts,
        locale
      });

      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.CONTEXT_BUILT,
        payload: {
          stepIndex,
          messageCount: messages.length,
          estimatedChars: JSON.stringify(messages).length
        }
      });

      // Attempt model decision; retry once on parse failure
      let repairCount = 0;
      let lastRepairError: ModelDecisionError | undefined;
      let output = await this.requestModelDecision({
        client,
        settings,
        loopInput: input,
        stepIndex,
        messages
      });
      if (!output) {
        return this.deps.getSnapshot(input.runId);
      }

      while (repairCount <= MAX_REPAIR_ATTEMPTS) {
        const parsed = this.parser.parse(output.text);
        if (parsed.ok) {
          const decision = normalizeModelDecision(parsed.decision);
          const decisionError = validateRepairDecision(decision, lastRepairError) ?? validateModelDecision(
            decision,
            toolsContracts,
            this.deps.getSnapshot(input.runId),
            input.record
          );
          if (decisionError) {
            this.deps.appendTrace(input.record, {
              runId: input.runId,
              type: TRACE_EVENT_NAMES.DECISION_PARSE_FAILED,
              payload: {
                stepIndex,
                repairAttempt: repairCount,
                parseError: decisionError
              }
            });

            if (repairCount >= MAX_REPAIR_ATTEMPTS) {
              if (isExistingValueOverwriteError(decisionError)) {
                const handled = await this.handleDecision(input, {
                  type: 'finish',
                  message: existingValueFinishMessage(locale)
                });
                return handled.snapshot;
              }
              const failed: RunSnapshot = {
                ...this.deps.getSnapshot(input.runId),
                status: 'failed',
                error: {
                  code: decisionError.code,
                  message: decisionError.message
                },
                trace: input.record.trace
              };
              this.setSnapshot(input.runId, this.deps.withRunMessages(failed, input.record));
              return failed;
            }

            repairCount += 1;
            lastRepairError = decisionError;
            output = await this.requestModelDecision({
              client,
              settings,
              loopInput: input,
              stepIndex,
              messages: buildRepairMessages(messages, decisionError, toolsContracts)
            }) ?? { text: '' };
            if (!output) {
              return this.deps.getSnapshot(input.runId);
            }
            continue;
          }

          applyModelTaskStateUpdate(input.record, decision);
          this.deps.appendTrace(input.record, {
            runId: input.runId,
            type: TRACE_EVENT_NAMES.MODEL_DECISION,
            payload: {
              stepIndex,
              decision: sanitizeSensitiveDetail(decision)
            }
          });
          const handled = await this.handleDecision(input, decision);
          if (handled.done) {
            return handled.snapshot;
          }
          break; // proceed to next turn
        }

        this.deps.appendTrace(input.record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.DECISION_PARSE_FAILED,
          payload: {
            stepIndex,
            repairAttempt: repairCount,
            parseError: parsed.error
          }
        });

        if (repairCount >= MAX_REPAIR_ATTEMPTS) {
          const plainTextFinish = plainTextFinishMessage(output.text);
          if (plainTextFinish) {
            const handled = await this.handleDecision(input, {
              type: 'finish',
              message: plainTextFinish
            });
            return handled.snapshot;
          }
          const failed: RunSnapshot = {
            ...this.deps.getSnapshot(input.runId),
            status: 'failed',
            error: {
              code: parsed.error.code,
              message: parsed.error.message
            },
            trace: input.record.trace
          };
          this.setSnapshot(input.runId, this.deps.withRunMessages(failed, input.record));
          return failed;
        }

        // Repair: append corrective prompt and retry
        repairCount += 1;
        const parseFailureError: ModelDecisionError = {
          code: parsed.error.code,
          message: parsed.error.message,
          kind: 'parse_failure'
        };
        lastRepairError = parseFailureError;
        output = await this.requestModelDecision({
          client,
          settings,
          loopInput: input,
          stepIndex,
          messages: buildRepairMessages(messages, parseFailureError, toolsContracts)
        }) ?? { text: '' };
        if (!output) {
          return this.deps.getSnapshot(input.runId);
        }
      }

      this.abortControllers.delete(input.runId);
      this.updateStreaming(input.runId, input.record);
      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TURN_FINISHED,
        payload: { stepIndex }
      });
    }

    const failed: RunSnapshot = {
      ...this.deps.getSnapshot(input.runId),
      status: 'failed',
      error: {
        code: ERROR_CODES.MAX_STEPS_EXCEEDED,
        message: 'Unified agent loop exceeded max steps'
      },
      trace: input.record.trace
    };
    this.setSnapshot(input.runId, this.deps.withRunMessages(failed, input.record));
    return failed;
  }

  private setSnapshot(runId: string, snapshot: RunSnapshot): void {
    this.deps.setSnapshot(runId, snapshot);
    this.deps.notifySnapshotUpdated(runId);
  }

  private async requestModelDecision(ctx: {
    client: ModelClient;
    settings: { baseUrl: string; model: string; streamingEnabled?: boolean | undefined };
    loopInput: UnifiedRuntimeAgentLoopInput;
    stepIndex: number;
    messages: ModelMessage[];
  }): Promise<{ text: string } | undefined> {
    const controller = new AbortController();
    this.abortControllers.set(ctx.loopInput.runId, controller);
    const common = {
      runId: ctx.loopInput.runId,
      stepIndex: ctx.stepIndex,
      responseFormat: 'json' as const,
      messages: ctx.messages,
      signal: controller.signal
    };
    const provider = providerHost(ctx.settings.baseUrl);
    const streamComplete = ctx.client.streamComplete?.bind(ctx.client);
    const streamingEnabled = ctx.settings.streamingEnabled !== false && streamComplete !== undefined;
    this.deps.appendTrace(ctx.loopInput.record, {
      runId: ctx.loopInput.runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
      payload: {
        stepIndex: ctx.stepIndex,
        provider,
        model: ctx.settings.model,
        streamingEnabled
      }
    });
    this.updateStreaming(ctx.loopInput.runId, ctx.loopInput.record);

    if (streamingEnabled && streamComplete) {
      let charCount = 0;
      try {
        const output = await withModelDecisionTimeout(
          streamComplete(common, {
            onDelta: (_delta) => {
              charCount += typeof _delta === 'string' ? _delta.length : 0;
              // Only record charCount in trace, never raw delta content
              this.deps.appendTrace(ctx.loopInput.record, {
                runId: ctx.loopInput.runId,
                type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
                payload: {
                  stepIndex: ctx.stepIndex,
                  charCount
                }
              });
              this.updateStreaming(ctx.loopInput.runId, ctx.loopInput.record);
            }
          }),
          controller
        );
        if (output === MODEL_TIMEOUT) {
          return this.modelTimeoutDecision(ctx, charCount);
        }
        this.deps.appendTrace(ctx.loopInput.record, {
          runId: ctx.loopInput.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED,
          payload: {
            stepIndex: ctx.stepIndex,
            model: ctx.settings.model,
            charCount,
            finalPreview: redactModelOutputText(output.text)
          }
        });
        return output;
      } catch (error) {
        if (controller.signal.aborted) {
          return undefined;
        }
        const message = maskSecret(error instanceof Error ? error.message : String(error));
        this.deps.appendTrace(ctx.loopInput.record, {
          runId: ctx.loopInput.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
          payload: {
            stepIndex: ctx.stepIndex,
            charCount,
            summary: message
          }
        });
        this.deps.appendTrace(ctx.loopInput.record, {
          runId: ctx.loopInput.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
          payload: {
            stepIndex: ctx.stepIndex,
            reason: `stream_failed: ${message}`
          }
        });
        this.updateStreaming(ctx.loopInput.runId, ctx.loopInput.record);
      }
    } else {
      this.deps.appendTrace(ctx.loopInput.record, {
        runId: ctx.loopInput.runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
        payload: {
          stepIndex: ctx.stepIndex,
          reason: 'streaming_disabled'
        }
      });
      this.updateStreaming(ctx.loopInput.runId, ctx.loopInput.record);
    }

    const output = await withModelDecisionTimeout(ctx.client.complete(common), controller);
    if (output === MODEL_TIMEOUT) {
      return this.modelTimeoutDecision(ctx, 0);
    }
    this.deps.appendTrace(ctx.loopInput.record, {
      runId: ctx.loopInput.runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
      payload: {
        stepIndex: ctx.stepIndex,
        model: ctx.settings.model,
        finalPreview: redactModelOutputText(output.text)
      }
    });
    return output;
  }

  private modelTimeoutDecision(ctx: {
    settings: { model: string };
    loopInput: UnifiedRuntimeAgentLoopInput;
    stepIndex: number;
  }, charCount: number): { text: string } {
    this.deps.appendTrace(ctx.loopInput.record, {
      runId: ctx.loopInput.runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
      payload: {
        stepIndex: ctx.stepIndex,
        model: ctx.settings.model,
        charCount,
        summary: `timeout after ${MODEL_DECISION_TIMEOUT_MS}ms`
      }
    });
    this.updateStreaming(ctx.loopInput.runId, ctx.loopInput.record);
    return {
      text: JSON.stringify({
        type: 'fail',
        code: ERROR_CODES.MODEL_REQUEST_FAILED,
        message: MODEL_DECISION_TIMEOUT_MESSAGE
      })
    };
  }

  private updateStreaming(runId: string, record: RunRecord): void {
    const current = this.deps.getSnapshot(runId);
    this.setSnapshot(runId, {
      ...current,
      streaming: streamingStateFromTrace(record.trace),
      trace: record.trace
    });
  }

  private async handleDecision(
    input: UnifiedRuntimeAgentLoopInput,
    decision: AgentDecision
  ): Promise<{ done: boolean; snapshot: RunSnapshot }> {
    if (decision.type === 'finish') {
      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.RUN_FINISHED,
        payload: {
          status: 'finished',
          message: redactTextForModelContext(decision.message)
        }
      });
      const snapshot: RunSnapshot = {
        ...this.deps.getSnapshot(input.runId),
        status: 'finished',
        taskState: input.record.taskState,
        messages: upsertFinalMessage(
          this.deps.getSnapshot(input.runId).messages,
          input.runId,
          decision.message
        ),
        trace: input.record.trace
      };
      this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
      return { done: true, snapshot };
    }

    if (decision.type === 'ask_user') {
      const current = this.deps.getSnapshot(input.runId);
      const currentWithoutError: RunSnapshot = { ...current };
      delete currentWithoutError.error;
      const snapshot: RunSnapshot = {
        ...currentWithoutError,
        status: 'waiting_for_user',
        taskState: input.record.taskState,
        messages: upsertAgentMessage(
          current.messages,
          askUserMessage(input.runId, decision.question, input.record.locale ?? 'zh')
        ),
        trace: input.record.trace
      };
      this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
      return { done: true, snapshot };
    }

    if (decision.type === 'fail') {
      const snapshot: RunSnapshot = {
        ...this.deps.getSnapshot(input.runId),
        status: 'failed',
        taskState: input.record.taskState,
        error: {
          code: decision.code ?? ERROR_CODES.AGENT_FAIL,
          message: decision.message
        },
        trace: input.record.trace
      };
      this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
      return { done: true, snapshot };
    }

    if (decision.tool === TOOL_NAMES.REQUEST_ACT_MODE) {
      const snapshot: RunSnapshot = {
        ...this.deps.getSnapshot(input.runId),
        status: 'waiting_for_user',
        taskState: input.record.taskState,
        messages: [
          ...(this.deps.getSnapshot(input.runId).messages ?? []),
          modeSwitchRequestMessage(input.runId, input.record.locale ?? 'zh')
        ],
        trace: input.record.trace
      };
      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.STATE_CHANGED,
        payload: {
          status: 'waiting_for_user',
          reason: 'ask_mode_model_requested_act'
        }
      });
      this.setSnapshot(input.runId, snapshot);
      return { done: true, snapshot };
    }

    const snapshotBeforeTool = this.deps.getSnapshot(input.runId);
    const executableDecision = augmentRuntimeToolDecision(input.record, snapshotBeforeTool, decision);
    const rejection = validateRuntimeToolDecision(input.record, snapshotBeforeTool, executableDecision);
    if (rejection) {
      const current = this.deps.getSnapshot(input.runId);
      const currentWithoutError: RunSnapshot = { ...current };
      delete currentWithoutError.error;
      const snapshot: RunSnapshot = rejection.kind === 'needs_explicit_form_values'
        ? {
            ...currentWithoutError,
            status: 'waiting_for_user',
            taskState: input.record.taskState,
            messages: upsertAgentMessage(
              current.messages,
              explicitFormValuesMessage(
                input.runId,
                snapshotBeforeTool,
                input.record.locale ?? 'zh',
                rejection.fields ?? []
              )
            ),
            trace: input.record.trace
          }
        : {
            ...current,
            status: 'waiting_for_user',
            taskState: input.record.taskState,
            error: {
              code: rejection.code,
              message: rejection.message
            },
            trace: input.record.trace
          };
      this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
      return { done: true, snapshot };
    }

    await this.deps.executeTool({
      runId: input.runId,
      tool: executableDecision.tool,
      args: executableDecision.args
    });
    const snapshot = this.deps.getSnapshot(input.runId);
    syncTaskStateFromToolResult(input.record, snapshot.toolResult);
    const snapshotWithTaskState: RunSnapshot = {
      ...snapshot,
      taskState: input.record.taskState
    };
    this.setSnapshot(input.runId, snapshotWithTaskState);
    if (snapshot.status === 'waiting_for_approval') {
      return { done: true, snapshot: snapshotWithTaskState };
    }
    if (executableDecision.tool === TOOL_NAMES.AGENT_FINISH) {
      return { done: true, snapshot: snapshotWithTaskState };
    }
    return { done: false, snapshot: snapshotWithTaskState };
  }
}

// ── Message helpers ──

function upsertFinalMessage(
  messages: RunSnapshot['messages'],
  runId: string,
  message: string
): RunSnapshot['messages'] {
  const now = Date.now();
  const next = (messages ?? []).filter((item) => item.id !== `${runId}:agent-final`);
  return [
    ...next,
    {
      id: `${runId}:agent-final`,
      role: 'agent',
      kind: 'agent_status',
      status: 'complete',
      title: 'BrowserHelm',
      content: message,
      createdAt: now,
      updatedAt: now
    }
  ];
}

function upsertAgentMessage(
  messages: RunSnapshot['messages'],
  message: AgentMessage
): AgentMessage[] {
  const next = [...(messages ?? [])];
  const index = next.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...message, createdAt: next[index]?.createdAt ?? message.createdAt };
    return next;
  }
  return [...next, message];
}

function explicitFormValuesMessage(
  runId: string,
  snapshot: RunSnapshot,
  locale: Locale,
  fields: Array<{ fieldRefId: string; value: string }>
): AgentMessage {
  const now = Date.now();
  const fieldLabels = explicitValueFieldLabels(snapshot, fields).join('、');
  const fieldList = fieldLabels || t('runtime.formFill.explicitValuesFallbackFields', locale);
  return {
    id: `${runId}:form-explicit-values-required`,
    role: 'agent',
    kind: 'recommendation',
    status: 'complete',
    title: t('runtime.formFill.explicitValuesTitle', locale),
    content: t('runtime.formFill.explicitValuesContent', locale, { fields: fieldList }),
    createdAt: now,
    updatedAt: now
  };
}

function askUserMessage(
  runId: string,
  question: string,
  locale: Locale
): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:ask-user-required`,
    role: 'agent',
    kind: 'recommendation',
    status: 'complete',
    title: t('runtime.askUser.title', locale),
    content: question,
    createdAt: now,
    updatedAt: now
  };
}

function explicitValueFieldLabels(
  snapshot: RunSnapshot,
  fields: Array<{ fieldRefId: string }>
): string[] {
  const candidates = new Map(
    runtimeFormCandidates(snapshot).map((field) => [field.refId, field])
  );
  return fields
    .map((field) => {
      const candidate = candidates.get(field.fieldRefId);
      return stringValue(candidate?.label) ??
        stringValue(candidate?.name) ??
        field.fieldRefId;
    })
    .filter((value, index, all) => all.indexOf(value) === index);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// ── Task state management ──

function ensureTaskState(record: RunRecord): RuntimeTaskState {
  record.taskState ??= createInitialTaskState(redactTextForModelContext(record.task));
  return record.taskState;
}

function createInitialTaskState(goal: string): RuntimeTaskState {
  return {
    goal,
    completed: [],
    remaining: [goal],
    filledFieldRefs: [],
    verifiedFieldRefs: [],
    runtimeCompleted: [],
    runtimeFactsOverrideModelNotes: true,
    updatedBy: 'runtime',
    updatedAt: Date.now()
  };
}

function applyModelTaskStateUpdate(record: RunRecord, decision: AgentDecision): void {
  const update = decision.taskStateUpdate;
  if (!update) {
    return;
  }
  const state = ensureTaskState(record);
  if (update.goal) {
    state.goal = safeTaskStateText(update.goal);
  }
  if (update.completed) {
    state.completed = uniqueStrings([
      ...state.completed,
      ...safeTaskStateList(update.completed)
    ]).slice(-MAX_TASK_STATE_ITEMS);
  }
  if (update.remaining) {
    state.remaining = safeTaskStateList(update.remaining).slice(0, MAX_TASK_STATE_ITEMS);
  }
  if (update.recommendedNextDecision) {
    state.recommendedNextDecision = update.recommendedNextDecision;
  }
  if (update.reason) {
    state.reason = safeTaskStateText(update.reason);
  }
  state.updatedBy = mergeTaskStateSource(state.updatedBy, 'model');
  state.updatedAt = Date.now();
}

function syncTaskStateFromToolResult(
  record: RunRecord,
  result: RunSnapshot['toolResult']
): void {
  if (!result?.ok) {
    return;
  }
  if (!isFormFillTool(result.tool) && result.tool !== TOOL_NAMES.FORM_VERIFY) {
    return;
  }
  const fieldRefIds = fieldRefIdsFromToolResult(result);
  if (!fieldRefIds.length) {
    return;
  }
  const state = ensureTaskState(record);
  if (isFormFillTool(result.tool)) {
    state.filledFieldRefs = uniqueStrings([...state.filledFieldRefs, ...fieldRefIds]);
    state.runtimeCompleted = uniqueStrings([
      ...state.runtimeCompleted,
      `form_fill succeeded for ${fieldRefIds.join(', ')}`
    ]).slice(-MAX_TASK_STATE_ITEMS);
    state.recommendedNextDecision = 'finish';
    state.reason = 'The latest form fill succeeded. If the user did not ask to submit/send/continue, finish instead of repeating the fill.';
  } else {
    state.verifiedFieldRefs = uniqueStrings([...state.verifiedFieldRefs, ...fieldRefIds]);
    state.runtimeCompleted = uniqueStrings([
      ...state.runtimeCompleted,
      `form_verify succeeded for ${fieldRefIds.join(', ')}`
    ]).slice(-MAX_TASK_STATE_ITEMS);
    state.recommendedNextDecision = 'finish';
    state.reason = 'The latest form verification succeeded. If the user did not ask to submit, finish now.';
  }
  state.updatedBy = mergeTaskStateSource(state.updatedBy, 'runtime');
  state.updatedAt = Date.now();
}

function fieldRefIdsFromToolResult(result: NonNullable<RunSnapshot['toolResult']>): string[] {
  const data = isRecord(result.detail) && isRecord(result.detail.data)
    ? result.detail.data
    : undefined;
  const fields = Array.isArray(data?.fields)
    ? data.fields
    : Array.isArray(data?.fieldResults)
      ? data.fieldResults
      : undefined;
  if (!fields) {
    return [];
  }
  return uniqueStrings(fields
    .map((field) => isRecord(field) ? stringField(field, 'fieldRefId') : undefined)
    .filter((value): value is string => Boolean(value)));
}

function mergeTaskStateSource(
  current: RuntimeTaskState['updatedBy'],
  incoming: 'runtime' | 'model'
): RuntimeTaskState['updatedBy'] {
  return current === incoming ? current : 'runtime_and_model';
}

function safeTaskStateList(values: string[]): string[] {
  return values
    .map(safeTaskStateText)
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

function safeTaskStateText(value: string): string {
  return truncateStr(redactTextForModelContext(value), MAX_TASK_STATE_TEXT_CHARS) ?? '';
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

// ── Utility functions ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function truncateStr(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '…[truncated]';
}

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'unknown';
  }
}

function maskSecret(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/gu, '[MASKED]');
}

function withModelDecisionTimeout<T>(
  promise: Promise<T>,
  controller: AbortController
): Promise<T | typeof MODEL_TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      resolve(MODEL_TIMEOUT);
    }, MODEL_DECISION_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function isTerminalStatus(status: RunSnapshot['status']): boolean {
  return status === 'cancelled' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_user' ||
    status === 'finished' ||
    status === 'failed' ||
    status === 'error';
}

function redactModelOutputText(text: string): string {
  return maskSecret(redactTextForModelContext(text));
}

function plainTextFinishMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```')) {
    return undefined;
  }
  if (/[{}]/u.test(trimmed)) {
    return undefined;
  }
  return trimmed.slice(0, 4000);
}
