import type { RuntimePort } from './runtime-port';
import {
  runtimeResponseSchema,
  type DecideApprovalInput,
  type RuntimeEvent,
  type RuntimeProviderSettings,
  type RuntimeResponse,
  type RuntimeToolExecutionResult,
  type RunSnapshot,
  type StartRunInput
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

  subscribeRun(_runId: string, _listener: (event: RuntimeEvent) => void): () => void {
    return () => undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
