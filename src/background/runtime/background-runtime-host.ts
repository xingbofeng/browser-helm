import {
  runtimeRequestSchema,
  type RuntimeResponse
} from '../../runtime/runtime-messages';
import { RunManager } from './run-manager';

export class BackgroundRuntimeHost {
  constructor(private readonly runManager = new RunManager()) {}

  async handleMessage(message: unknown): Promise<RuntimeResponse> {
    const parsed = runtimeRequestSchema.safeParse(message);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'RUNTIME_MESSAGE_INVALID',
        message: 'Runtime message invalid'
      };
    }

    switch (parsed.data.type) {
      case 'BH_RUNTIME_START_RUN':
        return {
          ok: true,
          data: await this.runManager.startRun(parsed.data.input)
        };
      case 'BH_RUNTIME_GET_SNAPSHOT':
        return {
          ok: true,
          data: this.runManager.getSnapshot(parsed.data.runId)
        };
    }
  }
}
