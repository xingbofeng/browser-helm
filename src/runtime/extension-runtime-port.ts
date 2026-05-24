import type { RuntimePort } from './runtime-port';
import {
  runtimeResponseSchema,
  type RuntimeEvent,
  type RuntimeResponse,
  type RunSnapshot,
  type StartRunInput
} from './runtime-messages';

export class ExtensionRuntimePort implements RuntimePort {
  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const response = await sendRuntimeMessage({
      type: 'BH_RUNTIME_START_RUN',
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

  async cancelRun(_runId: string): Promise<void> {
    return Promise.resolve();
  }

  async sendUserReply(_runId: string, _message: string): Promise<void> {
    return Promise.resolve();
  }

  async getRunSnapshot(runId: string): Promise<RunSnapshot> {
    const response = await sendRuntimeMessage({
      type: 'BH_RUNTIME_GET_SNAPSHOT',
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
}

async function sendRuntimeMessage(message: unknown): Promise<RuntimeResponse> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return {
      ok: false,
      code: 'RUNTIME_UNAVAILABLE',
      message: 'Chrome runtime messaging is unavailable'
    };
  }
  const raw: unknown = await chrome.runtime.sendMessage(message);
  const parsed = runtimeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'RUNTIME_RESPONSE_INVALID',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
