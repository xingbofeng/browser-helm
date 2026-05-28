import { describe, expect, it } from 'vitest';

import { createApprovalStore } from '../../../../src/ui/stores/approval-store';

describe('approval store', () => {
  it('tracks pending request, loading state and decision errors', () => {
    const store = createApprovalStore();

    store.getState().setPending({
      id: 'apr_1',
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: { refId: 'frame_1:ref_1' },
      risk: 'high',
      reason: 'Delete account',
      status: 'pending',
      createdAt: 1
    });
    store.getState().startDecision('approved');
    store.getState().failDecision('Approval request not found');

    expect(store.getState().pending?.id).toBe('apr_1');
    expect(store.getState().decisionError).toBe('Approval request not found');
    expect(store.getState().decision).toBeUndefined();
  });
});
