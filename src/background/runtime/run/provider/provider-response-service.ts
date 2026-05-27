import type { AgentMessage } from '../../../../shared/schemas/agent-message.schema';
import type { ModelClient, ModelOutput } from '../../../../agent/model/model-client';
import type { RunSnapshot, RuntimeEvent } from '../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { SettingsStore } from '../../../../storage/interfaces/settings-store';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../shared/constants/event-names';
import { maskProviderSecret } from '../../../../shared/redaction';
import { createProviderClient } from '../../provider-client-factory';
import { errorMessage, upsertMessage } from '../run-message-presenter';
import { streamingStateFromTrace } from '../streaming-state';
import { providerLabel, providerPrompt } from './provider-prompt';

type ProviderRecord = {
  task: string;
  mode: RunMode;
  trace: RuntimeEvent[];
};

export type ProviderResponseServiceDeps = {
  settingsStore: SettingsStore;
  createProviderModelClient?: ((settings: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) => ModelClient) | undefined;
  hasProviderScheduled: (runId: string) => boolean;
  markProviderScheduled: (runId: string) => void;
  getSnapshot: (runId: string) => RunSnapshot;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  notifySnapshotUpdated: (runId: string) => void;
  withRunMessages: (
    snapshot: RunSnapshot,
    record: { task: string; trace: RuntimeEvent[]; skipProviderResponse?: boolean }
  ) => RunSnapshot;
};

export class ProviderResponseService {
  constructor(private readonly deps: ProviderResponseServiceDeps) {}

  schedule(runId: string, record: ProviderRecord, snapshot: RunSnapshot): void {
    if (this.deps.hasProviderScheduled(runId)) {
      return;
    }
    this.deps.markProviderScheduled(runId);
    void this.generate(runId, record, snapshot).catch((error) => {
      const message = error instanceof Error
        ? maskProviderSecret(error.message)
        : 'Model call failed';
      const current = this.deps.getSnapshot(runId);
      this.deps.setSnapshot(runId, {
        ...current,
        messages: [
          ...(current.messages ?? []),
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

  async testProviderSettings(input: {
    baseUrl: string;
    apiKey?: string | undefined;
    model: string;
  }): Promise<{
    ok: boolean;
    code: string;
    message: string;
    supportsStreaming: boolean;
    model: string;
  }> {
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
      const result = await client.testConnection();
      return {
        ok: result.ok,
        code: result.code,
        message: result.message,
        supportsStreaming: result.supportsStreaming ?? false,
        model: result.model ?? input.model
      };
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

  private async generate(
    runId: string,
    record: ProviderRecord,
    snapshot: RunSnapshot
  ): Promise<void> {
    const settings = await this.deps.settingsStore.getProviderSettings();
    if (!settings?.apiKey?.trim() || !settings.baseUrl?.trim() || !settings.model?.trim()) {
      const nextSnapshot = this.deps.withRunMessages(snapshot, record);
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
      this.deps.setSnapshot(runId, {
        ...nextSnapshot,
        messages,
        streaming: {
          enabled: false,
          active: false,
          chunkCount: 0,
          fallbackUsed: false
        }
      });
      this.deps.notifySnapshotUpdated(runId);
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
      const message = error instanceof Error
        ? maskProviderSecret(error.message)
        : 'Provider config invalid';
      const current = this.deps.getSnapshot(runId);
      const next = this.deps.withRunMessages({
        ...current,
        messages: [
          ...(current.messages ?? []),
          errorMessage(runId, '模型配置不可用', message)
        ]
      }, record);
      this.deps.setSnapshot(runId, {
        ...next,
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

    await this.streamOrComplete(runId, record, snapshot, settings, client);
  }

  private async streamOrComplete(
    runId: string,
    record: ProviderRecord,
    snapshot: RunSnapshot,
    settings: { baseUrl: string; model: string; streamingEnabled?: boolean },
    client: ModelClient
  ): Promise<void> {
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
    this.deps.appendTrace(record, {
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

    const promptInput = {
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

    this.deps.appendTrace(record, {
      runId,
      type: 'model_prompt',
      timestamp: Date.now(),
      payload: {
        messages: promptInput.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        totalChars: promptInput.messages.reduce((sum, message) => sum + message.content.length, 0)
      }
    });

    let text = '';
    let reasoningText = '';
    let chunkCount = 0;
    try {
      let output: ModelOutput;
      if ((settings.streamingEnabled ?? true) && client.streamComplete) {
        try {
          output = await client.streamComplete(promptInput, {
            onReasoningDelta: (reasoningDelta) => {
              reasoningText += maskProviderSecret(reasoningDelta);
              this.upsertProviderMessage(runId, record, {
                id: messageId,
                role: 'agent',
                kind: record.mode === 'ask' ? 'agent_status' : 'diagnosis',
                status: 'streaming',
                title: 'BrowserHelm',
                content: text,
                reasoning: reasoningText,
                createdAt: startedAt,
                updatedAt: Date.now()
              });
            },
            onDelta: (delta) => {
              if (this.deps.getSnapshot(runId).status === 'cancelled') {
                return;
              }
              chunkCount += 1;
              text += maskProviderSecret(delta);
              this.deps.appendTrace(record, {
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
                reasoning: reasoningText,
                createdAt: startedAt,
                updatedAt: Date.now()
              });
              this.refreshStreamingState(runId, record);
            }
          });
        } catch (streamError) {
          if (this.deps.getSnapshot(runId).status === 'cancelled') {
            return;
          }
          const reason = streamError instanceof Error
            ? maskProviderSecret(streamError.message)
            : 'Model streaming failed';
          this.deps.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
            timestamp: Date.now(),
            payload: { message: reason, chunkCount }
          });
          this.deps.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
            timestamp: Date.now(),
            payload: { reason: `stream_failed: ${reason}` }
          });
          output = await client.complete(promptInput);
          text = maskProviderSecret(output.text);
          this.deps.appendTrace(record, {
            runId,
            type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
            timestamp: Date.now(),
            payload: { charCount: text.length }
          });
        }
      } else {
        this.deps.appendTrace(record, {
          runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
          timestamp: Date.now(),
          payload: { reason: 'streaming_disabled' }
        });
        output = await client.complete(promptInput);
        text = maskProviderSecret(output.text);
        this.deps.appendTrace(record, {
          runId,
          type: TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED,
          timestamp: Date.now(),
          payload: { charCount: text.length }
        });
      }
      if (this.deps.getSnapshot(runId).status === 'cancelled') {
        return;
      }
      if (!text) {
        text = maskProviderSecret(output.text);
      }
      const finishedAt = Date.now();
      this.deps.appendTrace(record, {
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
        reasoning: reasoningText,
        createdAt: startedAt,
        updatedAt: finishedAt
      });
      this.setSnapshotStatus(runId, statusBeforeProvider);
      this.refreshStreamingState(runId, record);
    } catch (error) {
      if (this.deps.getSnapshot(runId).status === 'cancelled') {
        return;
      }
      const message = error instanceof Error
        ? maskProviderSecret(error.message)
        : 'Model streaming failed';
      this.deps.appendTrace(record, {
        runId,
        type: TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
        timestamp: Date.now(),
        payload: { message, chunkCount }
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
    record: { task: string; trace: RuntimeEvent[] },
    message: AgentMessage
  ): void {
    const current = this.deps.getSnapshot(runId);
    const next = this.deps.withRunMessages(current, record);
    const messages = [...(next.messages ?? [])];
    upsertMessage(messages, message);
    this.deps.setSnapshot(runId, {
      ...next,
      messages,
      streaming: streamingStateFromTrace(record.trace)
    });
    this.deps.notifySnapshotUpdated(runId);
  }

  private refreshStreamingState(
    runId: string,
    record: { trace: RuntimeEvent[] }
  ): void {
    const current = this.deps.getSnapshot(runId);
    this.deps.setSnapshot(runId, {
      ...current,
      streaming: streamingStateFromTrace(record.trace)
    });
    this.deps.notifySnapshotUpdated(runId);
  }

  private setSnapshotStatus(runId: string, status: RunSnapshot['status']): void {
    const current = this.deps.getSnapshot(runId);
    this.deps.setSnapshot(runId, {
      ...current,
      status
    });
    this.deps.notifySnapshotUpdated(runId);
  }
}
