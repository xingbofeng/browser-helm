import type { ModelClient, ModelInput, ModelOutput } from './ModelClient';

export class MockModelClient implements ModelClient {
  private cursor = 0;

  constructor(private readonly outputs: string[]) {}

  complete(_input: ModelInput): Promise<ModelOutput> {
    const value = this.outputs[this.cursor];
    this.cursor += 1;

    if (typeof value !== 'string') {
      throw new Error('No mock model output configured');
    }

    return Promise.resolve({
      text: value
    });
  }
}
