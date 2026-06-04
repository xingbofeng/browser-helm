import type { ModelClient } from '../model/model-client';
import type { ModelMessage } from '../../shared/schemas/model-message.schema';
import type { RunRecord } from './types';
import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { tZh } from '../../i18n/t';
import {
  redactTextForModelContext
} from '../../shared/redaction';

const MODEL_DECISION_TIMEOUT_MS = 10 * 60 * 1000;
const MODEL_DECISION_TIMEOUT_MESSAGE = tZh('runtime.error.modelTimeout');
const MODEL_TIMEOUT = Symbol('model_timeout');

export type ModelGatewaySettings = {
  baseUrl: string;
  model: string;
  streamingEnabled?: boolean | undefined;
};

export type ModelGatewayDeps = {
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  updateStreaming: (runId: string, record: RunRecord) => void;
};

export type ModelGatewayRequest = {
  client: ModelClient;
  settings: ModelGatewaySettings;
  runId: string;
  record: RunRecord;
  stepIndex: number;
  messages: ModelMessage[];
};

export class ModelGateway {
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(private readonly deps: ModelGatewayDeps) {}

  abortRun(runId: string): void {
    this.abortControllers.get(runId)?.abort();
    this.abortControllers.delete(runId);
  }

  async requestDecision(ctx: ModelGatewayRequest): Promise<{ text: string } | undefined> {
    const controller = new AbortController();
    this.abortControllers.set(ctx.runId, controller);
    const common = {
      runId: ctx.runId,
      stepIndex: ctx.stepIndex,
      responseFormat: 'json' as const,
      messages: ctx.messages,
      signal: controller.signal
    };
    const provider = providerHost(ctx.settings.baseUrl);
    const streamComplete = ctx.client.streamComplete?.bind(ctx.client);
    const streamingEnabled = ctx.settings.streamingEnabled !== false && streamComplete !== undefined;
    this.deps.appendTrace(ctx.record, {
      runId: ctx.runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
      payload: {
        stepIndex: ctx.stepIndex,
        provider,
        model: ctx.settings.model,
        streamingEnabled
      }
    });
    this.deps.updateStreaming(ctx.runId, ctx.record);

    if (streamingEnabled && streamComplete) {
      let charCount = 0;
      let reasoningCharCount = 0;
      let previewText = '';
      let reasoningPreview = '';
      try {
        const output = await withModelDecisionTimeout(
          streamComplete(common, {
            onDelta: (delta) => {
              if (typeof delta !== 'string' || delta.length === 0) {
                return;
              }
              charCount += delta.length;
              previewText = redactModelOutputText(`${previewText}${delta}`);
              this.deps.appendTrace(ctx.record, {
                runId: ctx.runId,
                type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
                payload: {
                  stepIndex: ctx.stepIndex,
                  charCount,
                  previewText
                }
              });
              this.deps.updateStreaming(ctx.runId, ctx.record);
            },
            onReasoningDelta: (delta) => {
              if (typeof delta !== 'string' || delta.length === 0) {
                return;
              }
              reasoningCharCount += delta.length;
              reasoningPreview = redactModelOutputText(`${reasoningPreview}${delta}`);
              this.deps.appendTrace(ctx.record, {
                runId: ctx.runId,
                type: TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
                payload: {
                  stepIndex: ctx.stepIndex,
                  charCount,
                  reasoningCharCount,
                  ...(previewText ? { previewText } : {}),
                  reasoningPreview
                }
              });
              this.deps.updateStreaming(ctx.runId, ctx.record);
            }
          }),
          controller
        );
        if (output === MODEL_TIMEOUT) {
          return this.modelTimeoutDecision(ctx, charCount);
        }
        this.deps.appendTrace(ctx.record, {
          runId: ctx.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED,
          payload: {
            stepIndex: ctx.stepIndex,
            model: ctx.settings.model,
            charCount,
            ...(previewText ? { previewText } : {}),
            ...(reasoningPreview ? { reasoningPreview } : {}),
            finalPreview: redactModelOutputText(output.text)
          }
        });
        return output;
      } catch (error) {
        if (controller.signal.aborted) {
          return undefined;
        }
        const message = maskSecret(error instanceof Error ? error.message : String(error));
        this.deps.appendTrace(ctx.record, {
          runId: ctx.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
          payload: {
            stepIndex: ctx.stepIndex,
            charCount,
            summary: message
          }
        });
        this.deps.appendTrace(ctx.record, {
          runId: ctx.runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
          payload: {
            stepIndex: ctx.stepIndex,
            reason: `stream_failed: ${message}`
          }
        });
        this.deps.updateStreaming(ctx.runId, ctx.record);
      }
    } else {
      this.deps.appendTrace(ctx.record, {
        runId: ctx.runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
        payload: {
          stepIndex: ctx.stepIndex,
          reason: 'streaming_disabled'
        }
      });
      this.deps.updateStreaming(ctx.runId, ctx.record);
    }

    try {
      const output = await withModelDecisionTimeout(ctx.client.complete(common), controller);
      if (output === MODEL_TIMEOUT) {
        return this.modelTimeoutDecision(ctx, 0);
      }
      this.deps.appendTrace(ctx.record, {
        runId: ctx.runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
        payload: {
          stepIndex: ctx.stepIndex,
          model: ctx.settings.model,
          finalPreview: redactModelOutputText(output.text)
        }
      });
      return output;
    } catch (error) {
      if (controller.signal.aborted) {
        return undefined;
      }
      const message = maskSecret(error instanceof Error ? error.message : String(error));
      this.deps.appendTrace(ctx.record, {
        runId: ctx.runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
        payload: {
          stepIndex: ctx.stepIndex,
          model: ctx.settings.model,
          summary: `fallback_failed: ${message}`
        }
      });
      this.deps.updateStreaming(ctx.runId, ctx.record);
      return {
        text: JSON.stringify({
          type: 'fail',
          code: ERROR_CODES.MODEL_REQUEST_FAILED,
          message
        })
      };
    }
  }

  private modelTimeoutDecision(ctx: ModelGatewayRequest, charCount: number): { text: string } {
    this.deps.appendTrace(ctx.record, {
      runId: ctx.runId,
      type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
      payload: {
        stepIndex: ctx.stepIndex,
        model: ctx.settings.model,
        charCount,
        summary: `timeout after ${MODEL_DECISION_TIMEOUT_MS}ms`
      }
    });
    this.deps.updateStreaming(ctx.runId, ctx.record);
    return {
      text: JSON.stringify({
        type: 'fail',
        code: ERROR_CODES.MODEL_REQUEST_FAILED,
        message: MODEL_DECISION_TIMEOUT_MESSAGE
      })
    };
  }
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

function redactModelOutputText(text: string): string {
  return maskSecret(redactTextForModelContext(text));
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
