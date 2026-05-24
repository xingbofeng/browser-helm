import type { ContextBuilder } from '../context/context-builder';
import type { DecisionParser } from '../parser/decision-parser';
import type { ModelClient } from '../model/model-client';
import type { AgentRunInput, AgentRunResult } from './agent-run';
import { RunController } from './run-controller';
import { createLoopSession } from './agent-state';
import { StepRunner } from './step-runner';
import type { ToolRouter } from '../../tools/core/tool-router';
import type { TraceRecorder } from '../../storage/interfaces/trace-recorder';
import { traceEventSchema } from '../../shared/schemas/trace.schema';
import type { ApprovalRequest } from '../../shared/schemas/approval.schema';
import { ApprovalPolicy } from '../policy/approval-policy';
import { approvalRequiredResult } from '../../tools/core/tool-result-factory';

type AgentLoopDeps = {
  modelClient: ModelClient;
  decisionParser: DecisionParser;
  toolRouter: ToolRouter;
  contextBuilder: ContextBuilder;
  traceRecorder: TraceRecorder;
  runtimeMetadata?: {
    model: string;
    providerBaseUrl?: string;
  };
};

const TRACE_SCHEMA_VERSION = '1.0.0';
const PROMPT_VERSION = 'v0.1.0';
const TOOL_SCHEMA_VERSION = 'v0.1.0';
const CONTEXT_POLICY_VERSION = 'v0.1.0';

export class AgentLoop {
  constructor(private readonly deps: AgentLoopDeps) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const runId = createRunId();
    const maxSteps = input.maxSteps ?? 3;
    const controller = new RunController(maxSteps);
    const stepRunner = new StepRunner();
    const approvalPolicy = new ApprovalPolicy();
    const session = createLoopSession({
      runId,
      task: input.task
    });
    const runtimeModel =
      this.deps.runtimeMetadata?.model ?? process.env.OPENAI_MODEL ?? 'mock-model';
    const runtimeBaseUrl =
      this.deps.runtimeMetadata?.providerBaseUrl ?? process.env.OPENAI_BASE_URL;

    appendTrace(this.deps.traceRecorder, {
      id: createEventId(runId, 0, 'run_started'),
      runId,
      type: 'run_started',
      timestamp: Date.now(),
      schemaVersion: TRACE_SCHEMA_VERSION,
      payload: {
        task: input.task,
        goal: input.goal,
        successCriteria: input.successCriteria,
        maxSteps,
        metadata: {
          schemaVersion: TRACE_SCHEMA_VERSION,
          promptVersion: PROMPT_VERSION,
          toolSchemaVersion: TOOL_SCHEMA_VERSION,
          contextPolicyVersion: CONTEXT_POLICY_VERSION,
          model: runtimeModel,
          providerBaseUrl: runtimeBaseUrl
        }
      }
    });

    for (let stepIndex = 0; controller.canRunStep(stepIndex); stepIndex += 1) {
      session.status = controller.status;
      const { stepId, startedAt } = stepRunner.createStepFrame(stepIndex);
      const intent = session.turns.at(-1)?.toolResult?.nextHints?.[0];

      const built = this.deps.contextBuilder.build({
        task: input.task,
        ...(input.goal ? { goal: input.goal } : {}),
        ...(input.successCriteria ? { successCriteria: input.successCriteria } : {}),
        turns: session.turns,
        toolNames: this.deps.toolRouter.listToolNames(),
        tools: this.deps.toolRouter.listToolContracts()
      });

      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'turn_started'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'turn_started',
        timestamp: startedAt,
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          stepIndex,
          ...(intent ? { intent } : {}),
          contextCharCount: built.compacted.totalChars
        }
      });

      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'context_built'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'context_built',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          messageCount: built.messages.length,
          charCount: built.compacted.totalChars
        }
      });
      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'context_compacted'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'context_compacted',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          retainedStepCount: built.compacted.steps.length,
          droppedStepCount: Math.max(
            0,
            session.turns.length - built.compacted.steps.length
          ),
          charCount: built.compacted.totalChars,
          policy: built.compacted.policy
        }
      });
      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'context_summary'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'context_summary',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          summary: built.compacted.contextText,
          charCount: built.compacted.totalChars
        }
      });

      let modelOutput;
      try {
        modelOutput = await this.deps.modelClient.complete({
          runId,
          stepIndex,
          messages: built.messages
        });
      } catch (error) {
        const normalized = normalizeModelError(error);
        return this.failRun({
          runId,
          stepId,
          stepIndex,
          startedAt,
          controller,
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable
        });
      }

      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'model_output_received'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'model_output_received',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          rawText: modelOutput.text,
          model: runtimeModel
        }
      });

      const parsed = this.deps.decisionParser.parse(modelOutput.text);
      if (!parsed.ok) {
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'decision_parse_failed'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'decision_parse_failed',
          timestamp: Date.now(),
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            rawText: modelOutput.text,
            parseError: {
              code: parsed.error.code,
              message: parsed.error.message,
              detail: parsed.error.detail
            },
            promptVersion: PROMPT_VERSION,
            toolSchemaVersion: TOOL_SCHEMA_VERSION,
            contextPolicyVersion: CONTEXT_POLICY_VERSION,
            schemaVersion: TRACE_SCHEMA_VERSION
          }
        });

        return this.failRun({
          runId,
          stepId,
          stepIndex,
          startedAt,
          controller,
          code: parsed.error.code,
          message: parsed.error.message
        });
      }

      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'model_decision'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'model_decision',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          decision: parsed.decision
        }
      });

      if (parsed.decision.type === 'finish') {
        controller.markFinished();
        const endedAt = Date.now();
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'turn_finished'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'turn_finished',
          timestamp: endedAt,
          durationMs: endedAt - startedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            stepIndex,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            status: 'finished'
          }
        });
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'run_finished'),
          runId,
          stepIndex,
          type: 'run_finished',
          timestamp: endedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            status: 'finished',
            message: parsed.decision.message
          }
        });
        return {
          runId,
          status: 'finished',
          message: parsed.decision.message,
          trace: this.deps.traceRecorder.list(runId)
        };
      }

      if (parsed.decision.type === 'ask_user') {
        controller.pause('ASK_USER_REQUIRED');
        const endedAt = Date.now();
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'turn_finished'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'turn_finished',
          timestamp: endedAt,
          durationMs: endedAt - startedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            stepIndex,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            status: 'paused'
          }
        });
        return {
          runId,
          status: 'paused',
          message: parsed.decision.question,
          trace: this.deps.traceRecorder.list(runId)
        };
      }

      if (parsed.decision.type === 'fail') {
        return this.failRun({
          runId,
          stepId,
          stepIndex,
          startedAt,
          controller,
          code: parsed.decision.code ?? 'AGENT_FAIL',
          message: parsed.decision.message
        });
      }

      const toolCall = parsed.decision;
      const toolContract = this.deps.toolRouter.getToolContract(toolCall.tool);
      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'tool_started'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'tool_started',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          tool: toolCall.tool,
          argsPreview: toolCall.args,
          risk: toolContract?.risk ?? 'safe',
          modes: toolContract?.modes ?? ['internal']
        }
      });

      const risk = toolContract?.risk ?? 'safe';
      const approvalEvaluation = approvalPolicy.evaluate({
        risk,
        requestedByToolResult: false
      });
      const toolResult = approvalEvaluation.requiresApproval
        ? approvalRequiredResult({
            reason: approvalEvaluation.reason,
            risk,
            actionPreview: `Tool ${toolCall.tool} with args ${JSON.stringify(toolCall.args)}`
          })
        : await this.deps.toolRouter.execute(
            {
              tool: toolCall.tool,
              args: toolCall.args
            },
            {
              runId,
              stepId
            }
          );

      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'tool_result'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'tool_result',
        timestamp: Date.now(),
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          tool: toolCall.tool,
          argsPreview: toolCall.args,
          result: toolResult
        }
      });

      session.turns.push({
        id: stepId,
        runId,
        stepIndex,
        ...(intent ? { intent } : {}),
        decision: parsed.decision,
        toolResult
      });

      if (toolCall.tool === 'bh_agent_finish' && toolResult.ok) {
        controller.markFinished();
        const endedAt = Date.now();
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'turn_finished'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'turn_finished',
          timestamp: endedAt,
          durationMs: endedAt - startedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            stepIndex,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            status: 'finished'
          }
        });
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'run_finished'),
          runId,
          stepIndex,
          type: 'run_finished',
          timestamp: endedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            status: 'finished',
            message: toolResult.summary
          }
        });
        return {
          runId,
          status: 'finished',
          message: toolResult.summary,
          trace: this.deps.traceRecorder.list(runId)
        };
      }

      if (toolCall.tool === 'bh_agent_ask_user' && toolResult.code === 'ASK_USER_REQUIRED') {
        controller.pause('ASK_USER_REQUIRED');
        const endedAt = Date.now();
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'turn_finished'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'turn_finished',
          timestamp: endedAt,
          durationMs: endedAt - startedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            stepIndex,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            status: 'paused'
          }
        });
        return {
          runId,
          status: 'paused',
          message: toolResult.summary,
          trace: this.deps.traceRecorder.list(runId)
        };
      }

      if (toolResult.requiresApproval) {
        const request: ApprovalRequest = {
          id: `apr_${runId}_${stepIndex}`,
          runId,
          stepId,
          tool: toolCall.tool,
          argsPreview: toolCall.args,
          risk: toolResult.approval?.risk ?? 'high',
          reason: toolResult.approval?.reason ?? 'Approval required',
          ...(toolResult.approval?.actionPreview
            ? { actionPreview: toolResult.approval.actionPreview }
            : {}),
          status: 'pending',
          createdAt: Date.now()
        };
        controller.waitForApproval(request.id);
        session.status = controller.status;

        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'approval_required'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'approval_required',
          timestamp: Date.now(),
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            request,
            summary: request.reason
          }
        });

        const endedAt = Date.now();
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'turn_finished'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'turn_finished',
          timestamp: endedAt,
          durationMs: endedAt - startedAt,
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            stepIndex,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            status: 'waiting_for_approval'
          }
        });

        return {
          runId,
          status: 'waiting_for_approval',
          message: request.reason,
          trace: this.deps.traceRecorder.list(runId)
        };
      }

      if (!toolResult.ok) {
        const retryable = getRetryableFromToolResult(toolResult);
        appendTrace(this.deps.traceRecorder, {
          id: createEventId(runId, stepIndex, 'tool_failed'),
          runId,
          turnId: stepId,
          stepIndex,
          type: 'tool_failed',
          timestamp: Date.now(),
          schemaVersion: TRACE_SCHEMA_VERSION,
          payload: {
            tool: toolCall.tool,
            argsPreview: toolCall.args,
            code: toolResult.code,
            message: toolResult.summary,
            retryable
          }
        });
        return this.failRun({
          runId,
          stepId,
          stepIndex,
          startedAt,
          controller,
          code: toolResult.code,
          message: toolResult.summary,
          ...(typeof retryable === 'boolean' ? { retryable } : {})
        });
      }

      const endedAt = Date.now();
      appendTrace(this.deps.traceRecorder, {
        id: createEventId(runId, stepIndex, 'turn_finished'),
        runId,
        turnId: stepId,
        stepIndex,
        type: 'turn_finished',
        timestamp: endedAt,
        durationMs: endedAt - startedAt,
        schemaVersion: TRACE_SCHEMA_VERSION,
        payload: {
          stepIndex,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          status: 'continued'
        }
      });
      session.status = controller.status;
    }

    return this.failRun({
      runId,
      stepId: `step_${maxSteps}`,
      stepIndex: maxSteps,
      startedAt: Date.now(),
      controller,
      code: 'MAX_STEPS_EXCEEDED',
      message: 'Run exceeded maxSteps limit'
    });
  }

  private failRun(input: {
    runId: string;
    stepId: string;
    stepIndex: number;
    startedAt: number;
    controller: RunController;
    code: string;
    message: string;
    retryable?: boolean;
  }): AgentRunResult {
    input.controller.markFailed();
    const endedAt = Date.now();

    appendTrace(this.deps.traceRecorder, {
      id: createEventId(input.runId, input.stepIndex, 'turn_finished'),
      runId: input.runId,
      turnId: input.stepId,
      stepIndex: input.stepIndex,
      type: 'turn_finished',
      timestamp: endedAt,
      durationMs: endedAt - input.startedAt,
      schemaVersion: TRACE_SCHEMA_VERSION,
      payload: {
        stepIndex: input.stepIndex,
        startedAt: input.startedAt,
        endedAt,
        durationMs: endedAt - input.startedAt,
        status: 'failed'
      }
    });

    appendTrace(this.deps.traceRecorder, {
      id: createEventId(input.runId, input.stepIndex, 'run_failed'),
      runId: input.runId,
      stepIndex: input.stepIndex,
      type: 'run_failed',
      timestamp: endedAt,
      schemaVersion: TRACE_SCHEMA_VERSION,
      payload: {
        status: 'failed',
        code: input.code,
        message: input.message,
        retryable: input.retryable ?? false
      }
    });

    return {
      runId: input.runId,
      status: 'failed',
      errorCode: input.code,
      message: input.message,
      trace: this.deps.traceRecorder.list(input.runId)
    };
  }
}

function appendTrace(recorder: TraceRecorder, event: unknown): void {
  recorder.append(traceEventSchema.parse(event));
}

function createRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEventId(runId: string, stepIndex: number, type: string): string {
  return `${runId}_${stepIndex}_${type}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeModelError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'MODEL_REQUEST_FAILED';
  const message = error instanceof Error ? error.message : String(error);

  return {
    code,
    message,
    retryable: code !== 'PROVIDER_NOT_CONFIGURED'
  };
}

function getRetryableFromToolResult(result: {
  error?:
    | {
    detail?: unknown;
      }
    | undefined;
}): boolean | undefined {
  const detail = result.error?.detail;
  if (
    typeof detail === 'object' &&
    detail !== null &&
    'retryable' in detail &&
    typeof detail.retryable === 'boolean'
  ) {
    return detail.retryable;
  }
  return undefined;
}
