import type { RunSnapshot } from '../../../runtime/runtime-messages';
import type { RunSessionPersistence } from './session-persistence';

export const SESSION_RECOVERY_UNSAFE = 'SESSION_RECOVERY_UNSAFE';

export function recoverPersistedRunSession(input: {
  persistence: RunSessionPersistence;
  runId: string;
  requestId: string;
  now: number;
  currentGenerationId?: string | undefined;
  currentTabId?: number | undefined;
  currentDomain?: string | undefined;
  currentFrameId?: number | string | undefined;
}): RunSnapshot {
  const summary = input.persistence.readSnapshotSummary(input.runId);
  const pendingAction = input.persistence.readPendingAction(input.requestId, input.now);
  const approvalRequest = input.persistence.readApprovalRequest(input.requestId, input.now);
  const failures: string[] = [];

  if (!summary) {
    failures.push('snapshot summary missing');
  }
  if (!pendingAction) {
    failures.push('pending action missing or expired');
  }
  if (!approvalRequest) {
    failures.push('approval request missing or expired');
  }
  if (summary && pendingAction && summary.generationId !== pendingAction.generationId) {
    failures.push('generation mismatch');
  }
  if (summary && approvalRequest && summary.generationId !== approvalRequest.generationId) {
    failures.push('approval generation mismatch');
  }
  if (summary && input.currentGenerationId && summary.generationId !== input.currentGenerationId) {
    failures.push('current generation mismatch');
  }
  if (summary?.targetTabId !== undefined && input.currentTabId !== undefined && summary.targetTabId !== input.currentTabId) {
    failures.push('tab mismatch');
  }
  if (summary?.domain && input.currentDomain && summary.domain !== input.currentDomain) {
    failures.push('domain mismatch');
  }
  const actionFrameId = frameIdFromAction(pendingAction?.action.args);
  if (actionFrameId !== undefined && input.currentFrameId !== undefined && actionFrameId !== String(input.currentFrameId)) {
    failures.push('frame mismatch');
  }

  if (failures.length > 0) {
    return unsafeSnapshot(input.runId, summary?.mode ?? 'ask', failures);
  }

  const request = approvalRequest!.request;
  return {
    runId: input.runId,
    ...(summary?.targetTabId === undefined ? {} : { targetTabId: summary.targetTabId }),
    mode: summary?.mode ?? 'ask',
    status: 'recovering',
    pendingApproval: request,
    recovery: {
      action: {
        type: 'ask_user',
        question: `Recovered pending approval: ${request.reason}`
      },
      attempts: 0,
      budgetRemaining: 1
    }
  };
}

function unsafeSnapshot(runId: string, mode: RunSnapshot['mode'], failures: string[]): RunSnapshot {
  const reason = `Session recovery unsafe: ${failures.join(', ')}`;
  return {
    runId,
    mode,
    status: 'error',
    error: {
      code: SESSION_RECOVERY_UNSAFE,
      message: reason
    },
    recovery: {
      action: {
        type: 'fail',
        reason
      },
      attempts: 0,
      budgetRemaining: 0,
      limitation: reason
    }
  };
}

function frameIdFromAction(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) {
    return undefined;
  }
  const frameId = args.frameId ?? args.iframeId ?? args.targetFrameId;
  return typeof frameId === 'string' || typeof frameId === 'number'
    ? String(frameId)
    : undefined;
}
