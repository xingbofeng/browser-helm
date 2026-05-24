import type {
  ModelClient,
  ModelInput,
  ModelOutput
} from '../../src/agent/model/model-client';

export class QueueModelClient implements ModelClient {
  private cursor = 0;

  constructor(private readonly outputs: string[]) {}

  async complete(_input: ModelInput): Promise<ModelOutput> {
    const value = this.outputs[this.cursor];
    this.cursor += 1;
    if (typeof value !== 'string') {
      throw new Error('No mock model output configured');
    }
    return {
      text: value
    };
  }
}
