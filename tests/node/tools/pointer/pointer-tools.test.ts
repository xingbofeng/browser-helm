import { afterEach, describe, expect, it, vi } from 'vitest';

import { bhPointerClick } from '../../../../src/tools/pointer/bh-pointer-click';
import { classifyCoordinateRisk } from '../../../../src/tools/pointer/coordinate-risk';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coordinate risk', () => {
  it('requires approval for sensitive coordinate actions', () => {
    expect(classifyCoordinateRisk({
      x: 10,
      y: 20,
      reason: 'Click Pay now button after visual fallback'
    })).toMatchObject({
      risk: 'high',
      requiresApproval: true
    });
  });

  it('allows non-sensitive visual fallback coordinates as medium risk', () => {
    expect(classifyCoordinateRisk({
      x: 10,
      y: 20,
      reason: 'Dismiss tooltip that blocks the menu'
    })).toMatchObject({
      risk: 'medium',
      requiresApproval: false
    });
  });
});

describe('pointer click tool', () => {
  it('clicks coordinates only after visual fallback reason is supplied', async () => {
    const executeScript = vi.fn(async () => [{ result: { clicked: true, tagName: 'BUTTON' } }]);
    vi.stubGlobal('chrome', {
      scripting: { executeScript }
    });

    const result = await bhPointerClick().execute(
      { x: 30, y: 40, reason: 'Dismiss tooltip that blocks the menu' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'full', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true,
      requiresObserve: true
    });
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42 },
      args: [30, 40]
    }));
  });

  it('does not click sensitive coordinates and asks for approval', async () => {
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', {
      scripting: { executeScript }
    });

    const result = await bhPointerClick().execute(
      { x: 30, y: 40, reason: 'Click Pay now button' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'full', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      requiresApproval: true,
      changedPage: false
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('falls back to CDP mouse events when scripting lacks host permission', async () => {
    const executeScript = vi.fn(async () => {
      throw new Error('Cannot access contents of url. Extension manifest must request permission to access this host.');
    });
    const sendCommand = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const result = await bhPointerClick().execute(
      { x: 30, y: 40, reason: 'Dismiss tooltip that blocks the menu' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'full', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true,
      requiresObserve: true
    });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Input.dispatchMouseEvent',
      expect.objectContaining({ type: 'mouseReleased', x: 30, y: 40 })
    );
  });
});
