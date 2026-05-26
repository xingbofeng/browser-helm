import type { ModelMessage } from '../../shared/schemas/model-message.schema';

export type ModelInput = {
  runId: string;
  stepIndex: number;
  messages: ModelMessage[];
  responseFormat?: 'json' | 'text';
};

export type ModelOutput = {
  text: string;
};

export type ModelStreamCallbacks = {
  onStart?: (() => void) | undefined;
  onDelta?: ((delta: string) => void) | undefined;
  onFinish?: ((output: ModelOutput) => void) | undefined;
  onError?: ((error: Error) => void) | undefined;
};

export interface ModelClient {
  complete(input: ModelInput): Promise<ModelOutput>;
  streamComplete?(
    input: ModelInput,
    callbacks?: ModelStreamCallbacks
  ): Promise<ModelOutput>;
}
