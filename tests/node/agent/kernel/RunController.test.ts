import { describe, expect, it } from 'vitest';

import { RunController } from '../../../../src/agent/kernel/RunController';

describe('RunController', () => {
  it('enforces maxSteps limit', () => {
    const controller = new RunController(2);

    expect(controller.canRunStep(0)).toBe(true);
    expect(controller.canRunStep(1)).toBe(true);
    expect(controller.canRunStep(2)).toBe(false);
  });

  it('supports pause and resume status transitions', () => {
    const controller = new RunController(3);

    controller.pause('approval-required');
    expect(controller.status).toBe('paused');
    expect(controller.pauseReason).toBe('approval-required');

    controller.resume();
    expect(controller.status).toBe('running');
  });

  it('supports waiting_for_approval and cancel', () => {
    const controller = new RunController(3);

    controller.waitForApproval('apr_1');
    expect(controller.status).toBe('waiting_for_approval');
    expect(controller.pendingApprovalRequestId).toBe('apr_1');

    controller.cancel();
    expect(controller.status).toBe('cancelled');
    expect(controller.canRunStep(0)).toBe(false);
  });
});
