import { describe, expect, it } from 'vitest';

import {
  ChromeStorageRunSessionPersistence,
  RUN_SESSION_PENDING_TTL_MS
} from '../../../../src/background/runtime/run/session-persistence';

describe('ChromeStorageRunSessionPersistence', () => {
  it('hydrates pending actions, snapshots, and audit events from chrome.storage.session', async () => {
    const area = fakeStorageArea({
      'browserHelm.runSession.v1': {
        snapshots: [{
          runId: 'run_1',
          generationId: 'run_1:generation',
          status: 'waiting_for_approval',
          mode: 'form',
          updatedAt: 1000
        }],
        pendingActions: [{
          requestId: 'req_1',
          runId: 'run_1',
          generationId: 'run_1:generation',
          action: {
            runId: 'run_1',
            tool: 'bh_form_submit_with_approval',
            args: {}
          },
          createdAt: 1000,
          expiresAt: Date.now() + RUN_SESSION_PENDING_TTL_MS
        }],
        auditEvents: [{
          runId: 'run_1',
          generationId: 'run_1:generation',
          type: 'approval_required',
          timestamp: 1000
        }]
      }
    });
    const persistence = new ChromeStorageRunSessionPersistence(area);
    await persistence.ready;

    expect(persistence.readSnapshotSummary('run_1')?.status).toBe('waiting_for_approval');
    expect(persistence.readPendingAction('req_1', Date.now())?.action.tool).toBe('bh_form_submit_with_approval');
    expect(persistence.readAuditEvents('run_1')[0]?.type).toBe('approval_required');
  });

  it('flushes pending action changes back to chrome.storage.session', async () => {
    const backing: Record<string, unknown> = {};
    const area = fakeStorageArea(backing);
    const persistence = new ChromeStorageRunSessionPersistence(area);
    await persistence.ready;

    persistence.persistPendingAction({
      requestId: 'req_1',
      runId: 'run_1',
      generationId: 'run_1:generation',
      action: {
        runId: 'run_1',
        tool: 'bh_page_observe',
        args: {}
      },
      createdAt: 1000,
      expiresAt: Date.now() + RUN_SESSION_PENDING_TTL_MS
    });
    await Promise.resolve();
    await Promise.resolve();

    const state = backing['browserHelm.runSession.v1'] as {
      pendingActions: Array<{ requestId: string }>;
    };
    expect(state.pendingActions).toMatchObject([{ requestId: 'req_1' }]);
  });
});

function fakeStorageArea(backing: Record<string, unknown>): chrome.storage.StorageArea {
  return {
    get: async (key: string) => ({ [key]: backing[key] }),
    set: async (value: Record<string, unknown>) => {
      Object.assign(backing, value);
    }
  } as unknown as chrome.storage.StorageArea;
}
