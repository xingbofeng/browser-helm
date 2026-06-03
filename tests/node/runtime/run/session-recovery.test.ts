import { describe, expect, it } from 'vitest';

import { recoverPersistedRunSession } from '../../../../src/background/runtime/run/session-recovery';
import {
  InMemoryRunSessionPersistence,
  RUN_SESSION_PENDING_TTL_MS
} from '../../../../src/background/runtime/run/session-persistence';

describe('recoverPersistedRunSession', () => {
  it('recovers only when generation, tab, frame, domain, and TTL evidence match', () => {
    const persistence = persistedApprovalSession();

    const snapshot = recoverPersistedRunSession({
      persistence,
      runId: 'run_1',
      requestId: 'req_1',
      now: 1000,
      currentGenerationId: 'run_1:generation',
      currentTabId: 42,
      currentDomain: 'app.example.com',
      currentFrameId: 7
    });

    expect(snapshot).toMatchObject({
      runId: 'run_1',
      targetTabId: 42,
      mode: 'form',
      status: 'recovering',
      pendingApproval: {
        id: 'req_1',
        tool: 'bh_form_submit_with_approval',
        reason: 'Submit form'
      },
      recovery: {
        action: {
          type: 'ask_user'
        }
      }
    });
    expect(snapshot.recovery?.action.type === 'ask_user' ? snapshot.recovery.action.question : '').toContain('Submit form');
  });

  it('fails closed with a user-facing reason when current page evidence does not match', () => {
    const persistence = persistedApprovalSession();

    const snapshot = recoverPersistedRunSession({
      persistence,
      runId: 'run_1',
      requestId: 'req_1',
      now: 1000,
      currentGenerationId: 'run_1:generation',
      currentTabId: 99,
      currentDomain: 'evil.example',
      currentFrameId: 8
    });

    expect(snapshot).toMatchObject({
      runId: 'run_1',
      mode: 'form',
      status: 'error',
      error: {
        code: 'SESSION_RECOVERY_UNSAFE'
      },
      recovery: {
        action: {
          type: 'fail'
        }
      }
    });
    expect(snapshot.error?.message).toContain('domain mismatch');
    expect(snapshot.error?.message).toContain('frame mismatch');
    expect(snapshot.recovery?.action.type === 'fail' ? snapshot.recovery.action.reason : '').toContain('tab mismatch');
  });

  it('fails closed when persisted approval state is expired', () => {
    const persistence = persistedApprovalSession();

    const snapshot = recoverPersistedRunSession({
      persistence,
      runId: 'run_1',
      requestId: 'req_1',
      now: 1000 + RUN_SESSION_PENDING_TTL_MS + 1,
      currentGenerationId: 'run_1:generation',
      currentTabId: 42,
      currentDomain: 'app.example.com',
      currentFrameId: 7
    });

    expect(snapshot).toMatchObject({
      status: 'error',
      error: {
        code: 'SESSION_RECOVERY_UNSAFE'
      }
    });
    expect(snapshot.error?.message).toContain('pending action missing or expired');
  });
});

function persistedApprovalSession(): InMemoryRunSessionPersistence {
  const persistence = new InMemoryRunSessionPersistence();
  persistence.persistSnapshotSummary({
    runId: 'run_1',
    generationId: 'run_1:generation',
    status: 'waiting_for_approval',
    mode: 'form',
    targetTabId: 42,
    domain: 'app.example.com',
    pendingApprovalId: 'req_1',
    pendingApprovalTool: 'bh_form_submit_with_approval',
    pendingApprovalSummary: 'Submit form',
    updatedAt: 1000
  });
  persistence.persistPendingAction({
    requestId: 'req_1',
    runId: 'run_1',
    generationId: 'run_1:generation',
    action: {
      runId: 'run_1',
      tool: 'bh_form_submit_with_approval',
      args: {
        frameId: 7
      }
    },
    createdAt: 1000,
    expiresAt: 1000 + RUN_SESSION_PENDING_TTL_MS
  });
  persistence.persistApprovalRequest({
    requestId: 'req_1',
    runId: 'run_1',
    generationId: 'run_1:generation',
    request: {
      id: 'req_1',
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Submit form',
      status: 'pending',
      createdAt: 1000
    },
    createdAt: 1000,
    expiresAt: 1000 + RUN_SESSION_PENDING_TTL_MS
  });
  return persistence;
}
