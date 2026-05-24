import type { ModelClient, ModelInput, ModelOutput } from './model-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';

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
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(input: ModelInput): Promise<ModelOutput> {
    this.ensureConfigured();

    const response = await this.fetchImpl(
      `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: input.messages,
          response_format: {
            type: 'json_object'
          }
        })
      }
    );

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
}
