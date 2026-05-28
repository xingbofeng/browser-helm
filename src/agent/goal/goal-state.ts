import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';
import type { GoalState } from '../../shared/schemas/goal-plan.schema';
import { t } from '../../i18n/t';
import { goalStateSchema } from '../../shared/schemas/goal-plan.schema';

type InitializeGoalInput = {
  locale?: Locale;
  task: string;
  mode: RunMode;
  goal?: string;
  successCriteria?: string[];
};

export function initializeGoalState(input: InitializeGoalInput): GoalState {
  const locale = input.locale ?? 'zh';
  const successCriteria =
    input.successCriteria && input.successCriteria.length > 0
      ? input.successCriteria
      : defaultCriteria(input.mode, locale);
  return goalStateSchema.parse({
    goal: input.goal ?? input.task,
    successCriteria,
    satisfiedCriteria: [],
    unsatisfiedCriteria: successCriteria
  });
}

function defaultCriteria(mode: RunMode, locale: Locale): string[] {
  if (mode === 'form') {
    return [
      t('goal.criteria.form.0', locale),
      t('goal.criteria.form.1', locale),
    ];
  }
  if (mode === 'debug') {
    return [
      t('goal.criteria.debug.0', locale),
      t('goal.criteria.debug.1', locale),
    ];
  }
  if (mode === 'act') {
    return [
      t('goal.criteria.act.0', locale),
      t('goal.criteria.act.1', locale),
    ];
  }
  return [
    t('goal.criteria.default.0', locale),
    t('goal.criteria.default.1', locale),
  ];
}
