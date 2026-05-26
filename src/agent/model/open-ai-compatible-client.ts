import type {
  ModelClient,
  ModelInput,
  ModelOutput,
  ModelStreamCallbacks
} from './model-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import type { ProviderTestResult } from '../../shared/schemas/agent-message.schema';
import { maskProviderSecret } from '../../shared/redaction';
import { parseOpenAICompatibleStreamChunk } from './streaming-parser';

type FetchImpl = typeof fetch;

type OpenAICompatibleClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: FetchImpl;
};

type OpenAICompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

class ProviderNotConfiguredError extends Error {
  readonly code = ERROR_CODES.PROVIDER_NOT_CONFIGURED;
}

class ModelRequestFailedError extends Error {
  readonly code = ERROR_CODES.MODEL_REQUEST_FAILED;
}

export class OpenAICompatibleClient implements ModelClient {
  private readonly fetchImpl: FetchImpl;

  constructor(private readonly config: OpenAICompatibleClientConfig) {
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async complete(input: ModelInput): Promise<ModelOutput> {
    this.ensureConfigured();

    const response = await this.fetchImpl(this.completionsUrl(), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        messages: input.messages,
        ...(input.responseFormat === 'text'
          ? {}
          : {
              response_format: {
                type: 'json_object'
              }
            })
      })
    });

    if (!response.ok) {
      throw new ModelRequestFailedError(
        `Model request failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as OpenAICompletionResponse;
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new ModelRequestFailedError('Model response missing message content');
    }

    return {
      text
    };
  }

  async streamComplete(
    input: ModelInput,
    callbacks: ModelStreamCallbacks = {}
  ): Promise<ModelOutput> {
    this.ensureConfigured();
    callbacks.onStart?.();

    try {
      const response = await this.fetchImpl(this.completionsUrl(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: input.messages,
          ...(input.responseFormat === 'text'
            ? {}
            : {
                response_format: {
                  type: 'json_object'
                }
              }),
          stream: true
        })
      });

      if (!response.ok) {
        throw new ModelRequestFailedError(
          `Model stream request failed with status ${response.status}`
        );
      }
      if (!response.body) {
        throw new ModelRequestFailedError('Model stream response missing body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let done = false;
      let buffer = '';

      while (!done) {
        const read = await reader.read();
        done = read.done;
        if (read.value) {
          buffer += decoder.decode(read.value, { stream: !done });
          const lines = buffer.split(/\r?\n/u);
          buffer = lines.pop() ?? '';
          const parsed = parseOpenAICompatibleStreamChunk(lines.join('\n'));
          if (parsed.errors?.length) {
            throw new ModelRequestFailedError(parsed.errors.join('; '));
          }
          for (const delta of parsed.deltas) {
            text += delta;
            callbacks.onDelta?.(delta);
          }
          if (parsed.done) {
            break;
          }
        }
      }
      buffer += decoder.decode();
      const trailing = parseOpenAICompatibleStreamChunk(buffer);
      if (trailing.errors?.length) {
        throw new ModelRequestFailedError(trailing.errors.join('; '));
      }
      for (const delta of trailing.deltas) {
        text += delta;
        callbacks.onDelta?.(delta);
      }

      if (!text) {
        throw new ModelRequestFailedError('Model stream response missing content');
      }
      const output = { text };
      callbacks.onFinish?.(output);
      return output;
    } catch (error) {
      const normalized = normalizeModelError(error, 'Model stream request failed');
      callbacks.onError?.(normalized);
      throw normalized;
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      await this.complete({
        runId: 'provider_test',
        stepIndex: 0,
        messages: [
          {
            role: 'user',
            content: 'Return a JSON object exactly like {"ok":true}.'
          }
        ]
      });
      return {
        ok: true,
        code: ERROR_CODES.OK,
        message: '连接正常',
        supportsStreaming: true,
        model: this.config.model
      };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) {
        return {
          ok: false,
          code: error.code,
          message: error.message,
          supportsStreaming: false,
          model: this.config.model
        };
      }
      const normalized = normalizeModelError(error, 'Provider test failed');
      return {
        ok: false,
        code: normalized.code,
        message: normalized.message,
        supportsStreaming: false,
        model: this.config.model
      };
    }
  }

  private ensureConfigured(): void {
    const hasConfig =
      this.config.apiKey.length > 0 &&
      this.config.baseUrl.length > 0 &&
      this.config.model.length > 0;

    if (!hasConfig) {
      throw new ProviderNotConfiguredError(
        'OpenAI-compatible provider is not fully configured'
      );
    }
  }

  private completionsUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.config.apiKey}`
    };
  }
}

function normalizeModelError(error: unknown, fallback: string): ModelRequestFailedError {
  if (error instanceof ModelRequestFailedError) {
    return new ModelRequestFailedError(maskProviderSecret(error.message));
  }
  if (error instanceof ProviderNotConfiguredError) {
    return new ModelRequestFailedError(maskProviderSecret(error.message));
  }
  const message = error instanceof Error ? error.message : fallback;
  return new ModelRequestFailedError(maskProviderSecret(message));
}
