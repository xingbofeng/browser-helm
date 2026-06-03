import type { ModelClient } from '../model/model-client';
import type { SettingsStore } from '../../storage/interfaces/settings-store';
import type { ExecuteToolInput, RunSnapshot, RuntimeEvent } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import { createProviderClient } from '../../background/runtime/provider-client-factory';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import { streamingStateFromTrace } from '../../background/runtime/run/streaming-state';
import {
  redactTextForModelContext,
  sanitizeSensitiveDetail
} from '../../shared/redaction';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import { modeSwitchRequestMessage } from '../../background/runtime/run/mode-switch-message';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import { getPromptToolContracts } from './prompt-builder';
import {
  augmentRuntimeToolDecision,
  runtimeFormCandidates,
  validateRuntimeToolDecision
} from './form-fill-augmenter';
import {
  isExistingValueOverwriteError,
  existingValueFinishMessage,
  buildRepairMessages
} from './decision-validator';
import type { ModelDecisionError } from './decision-validator';
import { ModelGateway } from './model-gateway';
import { ContextAssembler } from './context-assembler';
import { TaskStateReducer } from './task-state-reducer';
import { TerminationEvaluator } from './termination-evaluator';
import { DecisionPipeline } from './decision-pipeline';

// ── Runtime constants ──
const MAX_REPAIR_ATTEMPTS = 1;

// ── Types ──

type AgentLoopDeps = {
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

type AgentLoopInput = {
  runId: string;
  record: RunRecord & { tabId: number };
  maxSteps?: number | undefined;
};

// ── Class ──

export class AgentLoop {
  private readonly modelGateway: ModelGateway;
  private readonly contextAssembler: ContextAssembler;
  private readonly taskStateReducer = new TaskStateReducer();
  private readonly terminationEvaluator = new TerminationEvaluator();
  private readonly decisionPipeline = new DecisionPipeline();

  constructor(private readonly deps: AgentLoopDeps) {
    this.modelGateway = new ModelGateway({
      appendTrace: deps.appendTrace,
      updateStreaming: (runId, record) => {
        this.updateStreaming(runId, record);
      }
    });
    this.contextAssembler = new ContextAssembler({
      getDomainPolicy: deps.settingsStore.getDomainPolicy
        ? async () => await deps.settingsStore.getDomainPolicy?.()
        : undefined
    });
  }

  abortRun(runId: string): void {
    this.modelGateway.abortRun(runId);
  }

  async run(input: AgentLoopInput): Promise<RunSnapshot> {
    const settings = await this.deps.settingsStore.getProviderSettings();
    if (!settings?.baseUrl || !settings.apiKey || !settings.model) {
      const current = this.deps.getSnapshot(input.runId);
      const snapshot: RunSnapshot = {
        ...current,
        status: 'waiting_for_user',
        error: {
          code: ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          message: 'Provider settings are required for the agent loop'
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
    const allToolsContracts = getPromptToolContracts(
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

      const turnContext = await this.contextAssembler.assembleTurn({
        record: input.record,
        snapshot: current,
        tabId: input.record.tabId,
        stepIndex,
        allToolsContracts
      });

      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOLS_SELECTED,
        payload: turnContext.selectionPayload
      });

      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.CONTEXT_BUILT,
        payload: {
          stepIndex,
          messageCount: turnContext.messages.length,
          estimatedChars: JSON.stringify(turnContext.messages).length
        }
      });

      // Attempt model decision; retry once on parse failure
      let repairCount = 0;
      let lastRepairError: ModelDecisionError | undefined;
      let output = await this.modelGateway.requestDecision({
        client,
        settings,
        runId: input.runId,
        record: input.record,
        stepIndex,
        messages: turnContext.messages
      });
      if (!output) {
        return this.deps.getSnapshot(input.runId);
      }

      while (repairCount <= MAX_REPAIR_ATTEMPTS) {
        const evaluatedDecision = this.decisionPipeline.evaluate({
          outputText: output.text,
          toolsContracts: turnContext.toolsContracts,
          snapshot: this.deps.getSnapshot(input.runId),
          record: input.record,
          lastRepairError
        });
        if (evaluatedDecision.ok) {
          const decision = evaluatedDecision.decision;
          this.taskStateReducer.applyModelDecision(input.record, decision);
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

        if (evaluatedDecision.parsed) {
          const decisionError = evaluatedDecision.error;
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
            if (
              decisionError.kind === 'repeated_form_fill' &&
              !taskRequestsSubmit(input.record.task)
            ) {
              const handled = await this.handleDecision(input, {
                type: 'finish',
                message: repeatedFormFillFinishMessage(locale)
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
          output = await this.modelGateway.requestDecision({
            client,
            settings,
            runId: input.runId,
            record: input.record,
            stepIndex,
            messages: buildRepairMessages(turnContext.messages, decisionError, turnContext.toolsContracts)
          }) ?? { text: '' };
          if (!output) {
            return this.deps.getSnapshot(input.runId);
          }
          continue;
        }

        const parseError = evaluatedDecision.error;
        this.deps.appendTrace(input.record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.DECISION_PARSE_FAILED,
          payload: {
            stepIndex,
            repairAttempt: repairCount,
            parseError
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
              code: parseError.code,
              message: parseError.message
            },
            trace: input.record.trace
          };
          this.setSnapshot(input.runId, this.deps.withRunMessages(failed, input.record));
          return failed;
        }

        // Repair: append corrective prompt and retry
        repairCount += 1;
        const parseFailureError: ModelDecisionError = {
          code: parseError.code,
          message: parseError.message,
          kind: 'parse_failure'
        };
        lastRepairError = parseFailureError;
        output = await this.modelGateway.requestDecision({
          client,
          settings,
          runId: input.runId,
          record: input.record,
          stepIndex,
          messages: buildRepairMessages(turnContext.messages, parseFailureError, turnContext.toolsContracts)
        }) ?? { text: '' };
        if (!output) {
          return this.deps.getSnapshot(input.runId);
        }
      }

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
        message: 'Agent loop exceeded max steps'
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

  private updateStreaming(runId: string, record: RunRecord): void {
    const current = this.deps.getSnapshot(runId);
    this.setSnapshot(runId, {
      ...current,
      streaming: streamingStateFromTrace(record.trace),
      trace: record.trace
    });
  }

  private async handleDecision(
    input: AgentLoopInput,
    decision: AgentDecision
  ): Promise<{ done: boolean; snapshot: RunSnapshot }> {
    if (decision.type === 'finish') {
      const current = this.deps.getSnapshot(input.runId);
      const termination = this.terminationEvaluator.evaluateFinish({
        goal: current.goal,
        taskState: input.record.taskState,
        trace: input.record.trace
      });
      if (termination.unmetCriteria.length > 0) {
        const snapshot: RunSnapshot = {
          ...current,
          status: 'waiting_for_user',
          taskState: input.record.taskState,
          ...(termination.goal ? { goal: termination.goal } : {}),
          messages: upsertAgentMessage(
            current.messages,
            askUserMessage(
              input.runId,
              unmetCriteriaQuestion(termination.unmetCriteria, input.record.locale ?? 'zh'),
              input.record.locale ?? 'zh'
            )
          ),
          trace: input.record.trace
        };
        this.deps.appendTrace(input.record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.STATE_CHANGED,
          payload: {
            status: 'waiting_for_user',
            reason: 'success_criteria_unmet',
            unmetCriteria: termination.unmetCriteria
          }
        });
        this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
        return { done: true, snapshot };
      }
      const completionEvidence = termination.completionEvidence;
      if (!completionEvidence.ok) {
        const snapshot: RunSnapshot = {
          ...current,
          status: 'waiting_for_user',
          taskState: input.record.taskState,
          ...(termination.goal ? { goal: termination.goal } : {}),
          messages: upsertAgentMessage(
            current.messages,
            askUserMessage(
              input.runId,
              taskVerificationQuestion(completionEvidence.reason, input.record.locale ?? 'zh'),
              input.record.locale ?? 'zh'
            )
          ),
          trace: input.record.trace
        };
        this.deps.appendTrace(input.record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.STATE_CHANGED,
          payload: {
            status: 'waiting_for_user',
            reason: 'task_verification_unmet',
            verifierReason: completionEvidence.reason,
            tool: completionEvidence.tool
          }
        });
        this.setSnapshot(input.runId, this.deps.withRunMessages(snapshot, input.record));
        return { done: true, snapshot };
      }
      this.deps.appendTrace(input.record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.RUN_FINISHED,
        payload: {
          status: 'finished',
          message: redactTextForModelContext(decision.message)
        }
      });
      const snapshot: RunSnapshot = {
        ...current,
        status: 'finished',
        taskState: input.record.taskState,
        ...(termination.goal ? { goal: termination.goal } : {}),
        messages: upsertFinalMessage(
          current.messages,
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
      const current = this.deps.getSnapshot(input.runId);
      const snapshot: RunSnapshot = {
        ...current,
        status: 'waiting_for_user',
        taskState: input.record.taskState,
        messages: [
          ...(current.messages ?? []),
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
      args: executableDecision.args,
      source: 'agent'
    });
    const snapshot = this.deps.getSnapshot(input.runId);
    this.taskStateReducer.syncFromToolResult(input.record, snapshot.toolResult);
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

function unmetCriteriaQuestion(criteria: string[], locale: Locale): string {
  const list = criteria.map((criterion) => `- ${criterion}`).join('\n');
  if (locale === 'en') {
    return `Before finishing, these success criteria are still unverified:\n${list}\nPlease keep verifying them or explain why they cannot be satisfied.`;
  }
  return `完成前仍有未验证的验收条件：\n${list}\n请继续验证这些条件，或说明为什么无法满足。`;
}

function taskVerificationQuestion(reason: string, locale: Locale): string {
  if (locale === 'en') {
    return `Missing page change evidence before finishing: ${reason}. Please verify the page state or explain why completion cannot be proven.`;
  }
  return `完成前缺少页面变更证据：${reason}。请继续验证页面状态，或说明为什么无法证明已完成。`;
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

function isTerminalStatus(status: RunSnapshot['status']): boolean {
  return status === 'cancelled' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_user' ||
    status === 'finished' ||
    status === 'failed' ||
    status === 'error';
}

function taskRequestsSubmit(task: string): boolean {
  const compact = task.replace(/\s+/gu, '').toLowerCase();
  if (
    /(?:不|不要|禁止|未|别)提交/u.test(compact) ||
    /(?:donot|don't|no)submit/u.test(compact)
  ) {
    return false;
  }
  return /submit|send|press enter|click search|提交|发送|按\s*enter|点击搜索|点击提交/iu.test(task);
}

function repeatedFormFillFinishMessage(locale: Locale): string {
  return locale === 'en'
    ? 'The requested field has already been filled. I did not submit the form.'
    : '请求的字段已经填写完成，未提交表单。';
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
