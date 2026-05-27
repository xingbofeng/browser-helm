import type { RuntimePort } from './runtime-port';
import {
  runtimeResponseSchema,
  type DecideApprovalInput,
  type ExecuteToolInput,
  type HighlightRefInput,
  type RuntimeEvent,
  type RuntimeProviderSettings,
  type RuntimeProviderTestResult,
  type RuntimeResponse,
  type RuntimeToolExecutionResult,
  type RunSnapshot,
  type ReviseGoalInput,
  type StartRunInput,
  type TestProviderSettingsInput
} from './runtime-messages';
import { ERROR_CODES } from '../shared/constants/error-codes';
import { RUNTIME_MESSAGES } from '../shared/constants/event-names';
import { ChromeSettingsStore } from '../storage/chrome/chrome-settings-store';

export class ExtensionRuntimePort implements RuntimePort {
  private readonly settingsStore = new ChromeSettingsStore();

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.START_RUN,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isStartRunData(response.data)) {
      throw new Error('Runtime start response is invalid');
    }
    return response.data;
  }

  async cancelRun(runId: string): Promise<void> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.CANCEL_RUN,
      runId
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
  }

  async reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.REVISE_GOAL,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isRunSnapshot(response.data)) {
      throw new Error('Runtime revise goal response is invalid');
    }
    return response.data;
  }

  async highlightRef(input: HighlightRefInput): Promise<RuntimeToolExecutionResult> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.HIGHLIGHT_REF,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isToolResult(response.data)) {
      throw new Error('Runtime highlight ref response is invalid');
    }
    return response.data;
  }

  async executeTool(input: ExecuteToolInput): Promise<RuntimeToolExecutionResult> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.EXECUTE_TOOL,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isToolResult(response.data)) {
      throw new Error('Runtime tool execution response is invalid');
    }
    return response.data;
  }

  async sendUserReply(_runId: string, _message: string): Promise<void> {
    return Promise.resolve();
  }

  async getRunSnapshot(runId: string): Promise<RunSnapshot> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.GET_SNAPSHOT,
      runId
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isRunSnapshot(response.data)) {
      throw new Error('Runtime snapshot response is invalid');
    }
    return response.data;
  }

  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void {
    if (!globalThis.chrome?.runtime?.connect) {
      return () => undefined;
    }
    const port = chrome.runtime.connect({ name: RUNTIME_MESSAGES.SUBSCRIBE_RUN });
    const onMessage = (message: unknown) => {
      if (!isRuntimeEvent(message) || message.runId !== runId) {
        return;
      }
      listener(message);
    };
    port.onMessage.addListener(onMessage);
    port.postMessage({ runId });
    return () => {
      port.onMessage.removeListener(onMessage);
      port.disconnect();
    };
  }

  async decideApproval(input: DecideApprovalInput): Promise<RuntimeToolExecutionResult> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.DECIDE_APPROVAL,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isToolResult(response.data)) {
      throw new Error('Runtime approval response is invalid');
    }
    return response.data;
  }

  getProviderSettings(): Promise<RuntimeProviderSettings | undefined> {
    return this.settingsStore.getProviderSettings();
  }

  setProviderSettings(settings: RuntimeProviderSettings): Promise<void> {
    return this.settingsStore.setProviderSettings(settings);
  }

  async testProviderSettings(
    input: TestProviderSettingsInput
  ): Promise<RuntimeProviderTestResult> {
    const response = await sendRuntimeMessage({
      type: RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
      input
    });
    if (!response.ok) {
      throw new Error(response.message);
    }
    if (!isProviderTestResult(response.data)) {
      throw new Error('Runtime provider test response is invalid');
    }
    return response.data;
  }
}

async function sendRuntimeMessage(message: unknown): Promise<RuntimeResponse> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return {
      ok: false,
      code: ERROR_CODES.RUNTIME_UNAVAILABLE,
      message: 'Chrome runtime messaging is unavailable'
    };
  }
  const raw: unknown = await chrome.runtime.sendMessage(message);
  const parsed = runtimeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: ERROR_CODES.RUNTIME_RESPONSE_INVALID,
      message: 'Runtime response invalid'
    };
  }
  return parsed.data;
}

function isStartRunData(value: unknown): value is { runId: string } {
  return isRecord(value) && typeof value.runId === 'string';
}

function isRunSnapshot(value: unknown): value is RunSnapshot {
  return isRecord(value) && typeof value.runId === 'string' && typeof value.status === 'string';
}

function isToolResult(value: unknown): value is RuntimeToolExecutionResult {
  return isRecord(value) && typeof value.ok === 'boolean' && typeof value.code === 'string';
}

function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  return isRecord(value) && typeof value.runId === 'string' && typeof value.type === 'string';
}

function isProviderTestResult(value: unknown): value is RuntimeProviderTestResult {
  return isRecord(value) && typeof value.ok === 'boolean' && typeof value.code === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
