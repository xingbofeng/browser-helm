import type { ReviseGoalInput, RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import { initializeGoalState } from '../../../agent/goal/goal-state';
import { buildPlanState } from '../../../agent/planning/plan-builder';
import { TRACE_EVENT_NAMES } from '../../../shared/constants/event-names';
import type { RunRecord } from './runtime-service-types';
import { readLocale } from '../../../i18n/locale';

export type GoalRevisionStore = {
  getRecord: (runId: string) => RunRecord | undefined;
  getSnapshot: (runId: string) => RunSnapshot;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
};

export class GoalRevisionService {
  constructor(private readonly store: GoalRevisionStore) {}

  async reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot> {
    const current = this.store.getSnapshot(input.runId);
    const record = this.store.getRecord(input.runId);
    const mode = record?.mode ?? current.mode;
    const locale = await readLocale();
    const goal = initializeGoalState({
      locale, task: input.goal, mode, goal: input.goal,
      ...(input.successCriteria ? { successCriteria: input.successCriteria } : {})
    });
    const plan = buildPlanState({
      id: `plan_${input.runId}_revised`, mode, task: input.goal, updatedAt: Date.now(), locale
    });
    const event: RuntimeEvent = {
      runId: input.runId, type: TRACE_EVENT_NAMES.PLAN_UPDATED,
      payload: { goal, plan, reason: 'goal_revised' }
    };
    if (record) {
      this.store.appendTrace(record, event);
    }
    const snapshot: RunSnapshot = {
      ...current, mode, goal, plan,
      canInterrupt: true, canReviseGoal: true,
      trace: record?.trace ?? [...(current.trace ?? []), event]
    };
    this.store.setSnapshot(input.runId, snapshot);
    return snapshot;
  }
}
