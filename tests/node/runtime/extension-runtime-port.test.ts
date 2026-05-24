import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExtensionRuntimePort } from '../../../src/runtime/extension-runtime-port';
import { RUNTIME_MESSAGES } from '../../../src/shared/constants/event-names';

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
});
