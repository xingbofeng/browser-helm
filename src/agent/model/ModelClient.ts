import type { ModelMessage } from '../../shared/schemas/modelMessage.schema';

export type ModelInput = {
  runId: string;
  stepIndex: number;
  messages: ModelMessage[];
};

export type ModelOutput = {
  text: string;
};

export interface ModelClient {
  complete(input: ModelInput): Promise<ModelOutput>;
}
