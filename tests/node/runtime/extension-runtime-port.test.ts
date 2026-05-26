import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExtensionRuntimePort } from '../../../src/runtime/extension-runtime-port';
import { RUNTIME_MESSAGES, TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';

describe('ExtensionRuntimePort', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'chrome');
  });

  it('sends cancelRun through the runtime message boundary', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        runId: 'run_1',
        status: 'cancelled'
      }
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    const port = new ExtensionRuntimePort();

    await port.cancelRun('run_1');

    expect(sendMessage).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGES.CANCEL_RUN,
      runId: 'run_1'
    });
  });

  it('sends reviseGoal through the runtime message boundary', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        runId: 'run_1',
        mode: 'form',
        status: 'observed'
      }
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    const port = new ExtensionRuntimePort();

    await port.reviseGoal({
      runId: 'run_1',
      goal: '只读诊断当前表单',
      successCriteria: ['解释 disabled submit 原因']
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGES.REVISE_GOAL,
      input: {
        runId: 'run_1',
        goal: '只读诊断当前表单',
        successCriteria: ['解释 disabled submit 原因']
      }
    });
  });

  it('sends provider test requests through the runtime message boundary', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true,
        model: 'gpt-4.1-mini'
      }
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    const port = new ExtensionRuntimePort();

    const result = await port.testProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-live-super-secret-token',
      streamingEnabled: true
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('sk-live-super-secret-token');
    expect(sendMessage).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
      input: {
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4.1-mini',
        apiKey: 'sk-live-super-secret-token',
        streamingEnabled: true
      }
    });
  });

  it('subscribes to runtime run events through a named port', () => {
    const listeners: Array<(message: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    const postMessage = vi.fn();
    const disconnect = vi.fn();
    const connect = vi.fn().mockReturnValue({
      postMessage,
      disconnect,
      onMessage: {
        addListener: (listener: (message: unknown) => void) => listeners.push(listener),
        removeListener: (listener: (message: unknown) => void) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        }
      },
      onDisconnect: {
        addListener: (listener: () => void) => disconnectListeners.push(listener),
        removeListener: (listener: () => void) => {
          const index = disconnectListeners.indexOf(listener);
          if (index >= 0) {
            disconnectListeners.splice(index, 1);
          }
        }
      }
    });
    vi.stubGlobal('chrome', {
      runtime: {
        connect
      }
    });
    const port = new ExtensionRuntimePort();
    const received: unknown[] = [];

    const unsubscribe = port.subscribeRun('run_1', (event) => {
      received.push(event);
    });
    listeners[0]?.({ runId: 'run_1', type: TRACE_EVENT_NAMES.RUN_STARTED });
    listeners[0]?.({ runId: 'run_2', type: TRACE_EVENT_NAMES.RUN_STARTED });
    unsubscribe();

    expect(connect).toHaveBeenCalledWith({ name: RUNTIME_MESSAGES.SUBSCRIBE_RUN });
    expect(postMessage).toHaveBeenCalledWith({ runId: 'run_1' });
    expect(received).toEqual([{ runId: 'run_1', type: TRACE_EVENT_NAMES.RUN_STARTED }]);
    expect(disconnect).toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });
});
