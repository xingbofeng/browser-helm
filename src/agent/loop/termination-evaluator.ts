import type { RunSnapshot, RuntimeEvent, RuntimeTaskState } from '../../runtime/runtime-messages';
import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import {
  verifyTaskCompletionBeforeFinish,
  type TaskVerificationResult
} from '../verification/task-verifier';

export type TerminationEvaluationInput = {
  goal: RunSnapshot['goal'];
  taskState: RuntimeTaskState | undefined;
  trace: RuntimeEvent[] | undefined;
  finalMessage?: string | undefined;
};

export type TerminationEvaluation = {
  goal: RunSnapshot['goal'];
  unmetCriteria: string[];
  completionEvidence: TaskVerificationResult;
};

export class TerminationEvaluator {
  evaluateFinish(input: TerminationEvaluationInput): TerminationEvaluation {
    const finishCriteria = evaluateFinishCriteria(
      input.goal,
      input.taskState,
      explicitSuccessCriteria(input.trace)
    );
    return {
      ...finishCriteria,
      completionEvidence: verifyTaskCompletionBeforeFinish(input.trace, {
        finalMessage: input.finalMessage
      })
    };
  }
}

function evaluateFinishCriteria(
  goal: RunSnapshot['goal'],
  taskState: RunSnapshot['taskState'],
  explicitCriteria: string[] | undefined
): {
  goal: RunSnapshot['goal'];
  unmetCriteria: string[];
} {
  if (!explicitCriteria?.length) {
    return { goal, unmetCriteria: [] };
  }
  if (!goal) {
    return { goal, unmetCriteria: explicitCriteria };
  }
  const criteria = explicitCriteria;
  const completed = [
    ...goal.satisfiedCriteria,
    ...(taskState?.completed ?? [])
  ];
  const satisfiedCriteria = criteria.filter((criterion) =>
    completed.some((item) => textMatchesCriterion(item, criterion))
  );
  const unmetCriteria = criteria.filter((criterion) =>
    !satisfiedCriteria.some((satisfied) => textMatchesCriterion(satisfied, criterion))
  );
  return {
    goal: {
      ...goal,
      satisfiedCriteria,
      unsatisfiedCriteria: unmetCriteria
    },
    unmetCriteria
  };
}

function explicitSuccessCriteria(trace: RuntimeEvent[] | undefined): string[] | undefined {
  const started = trace?.find((event) => event.type === TRACE_EVENT_NAMES.RUN_STARTED);
  if (!started || typeof started.payload !== 'object' || started.payload === null) {
    return undefined;
  }
  const value = started.payload.successCriteria;
  return Array.isArray(value)
    ? value.filter((criterion): criterion is string =>
        typeof criterion === 'string' && criterion.trim().length > 0
      )
    : undefined;
}

function textMatchesCriterion(left: string, right: string): boolean {
  const normalizedLeft = normalizeCriterionText(left);
  const normalizedRight = normalizeCriterionText(right);
  return normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft);
}

function normalizeCriterionText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}
