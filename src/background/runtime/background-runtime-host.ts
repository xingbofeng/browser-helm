import {
  runtimeRequestSchema,
  type RuntimeResponse
} from '../../runtime/runtime-messages';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { RUNTIME_MESSAGES } from '../../shared/constants/event-names';
import { RunManager } from './run-manager';

type RuntimeRunManager = Pick<
  RunManager,
  'startRun' | 'getSnapshot' | 'executeTool' | 'decideApproval'
>;

export class BackgroundRuntimeHost {
  constructor(private readonly runManager: RuntimeRunManager = new RunManager()) {}

  async handleMessage(message: unknown): Promise<RuntimeResponse> {
    const parsed = runtimeRequestSchema.safeParse(message);
    if (!parsed.success) {
      return {
        ok: false,
        code: ERROR_CODES.RUNTIME_MESSAGE_INVALID,
        message: 'Runtime message invalid'
      };
    }

    switch (parsed.data.type) {
      case RUNTIME_MESSAGES.START_RUN:
        return {
          ok: true,
          data: await this.runManager.startRun(parsed.data.input)
        };
      case RUNTIME_MESSAGES.GET_SNAPSHOT:
        return {
          ok: true,
          data: this.runManager.getSnapshot(parsed.data.runId)
        };
      case RUNTIME_MESSAGES.EXECUTE_TOOL:
        return {
          ok: true,
          data: await this.runManager.executeTool(parsed.data.input)
        };
      case RUNTIME_MESSAGES.DECIDE_APPROVAL:
        return {
          ok: true,
          data: await this.runManager.decideApproval(parsed.data.input)
        };
    }
  }
}
