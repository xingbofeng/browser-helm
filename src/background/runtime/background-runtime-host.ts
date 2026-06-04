import {
  type RuntimeEvent,
  runtimeRequestSchema,
  type RuntimeResponse
} from '../../runtime/runtime-messages';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { RUNTIME_MESSAGES } from '../../shared/constants/event-names';
import { tZh } from '../../i18n/t';
import { RunManager } from './run-manager';

export type RuntimeSenderContext = {
  senderId?: string | undefined;
  senderUrl?: string | undefined;
  senderOrigin?: string | undefined;
  isExtensionPage: boolean;
  isContentScript: boolean;
};

/** Message types that content scripts are NOT allowed to invoke. */
const CONTENT_SCRIPT_BLOCKED_MESSAGES = new Set([
  RUNTIME_MESSAGES.DECIDE_APPROVAL,
  RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
  RUNTIME_MESSAGES.SET_DOMAIN_ADAPTER_ENABLED,
  RUNTIME_MESSAGES.REQUEST_CAPABILITY,
  RUNTIME_MESSAGES.EXECUTE_TOOL
]);

type RuntimeRunManager = Pick<
  RunManager,
  | 'startRun'
  | 'getSnapshot'
  | 'cancelRun'
  | 'reviseGoal'
  | 'highlightRef'
  | 'executeTool'
  | 'decideApproval'
  | 'testProviderSettings'
  | 'setDomainAdapterEnabled'
  | 'subscribeRun'
> & {
  requestCapability?: RunManager['requestCapability'] | undefined;
};

export class BackgroundRuntimeHost {
  constructor(private readonly runManager: RuntimeRunManager = new RunManager()) {}

  async handleMessage(message: unknown, sender?: RuntimeSenderContext): Promise<RuntimeResponse> {
    const parsed = runtimeRequestSchema.safeParse(message);
    if (!parsed.success) {
      return {
        ok: false,
        code: ERROR_CODES.RUNTIME_MESSAGE_INVALID,
        message: tZh('runtime.error.messageInvalid')
      };
    }

    // Content scripts cannot invoke sensitive runtime operations.
    if (sender?.isContentScript && (CONTENT_SCRIPT_BLOCKED_MESSAGES as Set<string>).has(parsed.data.type)) {
      return {
        ok: false,
        code: ERROR_CODES.RUNTIME_MESSAGE_INVALID,
        message: tZh('runtime.error.messageInvalid')
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
      case RUNTIME_MESSAGES.CANCEL_RUN:
        return {
          ok: true,
          data: await this.runManager.cancelRun(parsed.data.runId)
        };
      case RUNTIME_MESSAGES.REVISE_GOAL:
        return {
          ok: true,
          data: await this.runManager.reviseGoal(parsed.data.input)
        };
      case RUNTIME_MESSAGES.HIGHLIGHT_REF:
        return {
          ok: true,
          data: await this.runManager.highlightRef(parsed.data.input)
        };
      case RUNTIME_MESSAGES.EXECUTE_TOOL:
        return {
          ok: true,
          data: await this.runManager.executeTool({
            ...parsed.data.input,
            source: 'user'
          })
        };
      case RUNTIME_MESSAGES.DECIDE_APPROVAL:
        return {
          ok: true,
          data: await this.runManager.decideApproval(parsed.data.input)
        };
      case RUNTIME_MESSAGES.REQUEST_CAPABILITY:
        if (!this.runManager.requestCapability) {
          return {
            ok: false,
            code: ERROR_CODES.RUNTIME_UNAVAILABLE,
            message: 'Runtime capability request is unavailable'
          };
        }
        return {
          ok: true,
          data: await this.runManager.requestCapability(parsed.data.input)
        };
      case RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION:
        return {
          ok: true,
          data: await this.runManager.testProviderSettings(parsed.data.input)
        };
      case RUNTIME_MESSAGES.SET_DOMAIN_ADAPTER_ENABLED:
        return {
          ok: true,
          data: await this.runManager.setDomainAdapterEnabled(parsed.data.input)
        };
    }
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    return this.runManager.subscribeRun(runId, listener);
  }
}
