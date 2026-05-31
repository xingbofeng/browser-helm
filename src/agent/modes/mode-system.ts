import type { RunMode } from '../../shared/schemas/tool.schema';
import type { Locale } from '../../i18n/types';
import type { TaskClassification } from '../../shared/schemas/mode-system.schema';
import { t } from '../../i18n/t';
import { classifyTask } from '../task/task-classifier';

type ResolveRunModeInput = {
  locale?: Locale;
  task: string;
  explicitMode?: RunMode;
};

type ResolvedRunMode = {
  mode: RunMode;
  productMode: 'ask' | 'act';
  internalStrategy: RunMode;
  reason: string;
  classification: TaskClassification;
};

export function resolveRunMode(input: ResolveRunModeInput): ResolvedRunMode {
  const locale = input.locale ?? 'zh';
  const classified = classifyTask(input.task, locale);
  if (input.explicitMode) {
    return {
      mode: input.explicitMode,
      productMode: toProductMode(input.explicitMode),
      internalStrategy: input.explicitMode,
      reason: t('mode.reason.userSelected', locale, {
        mode: input.explicitMode,
        boundary: boundaryReason(input.explicitMode, locale),
      }),
      classification: {
        ...classified,
        taskType: input.explicitMode,
        mode: input.explicitMode
      }
    };
  }

  return {
    mode: classified.mode,
    productMode: toProductMode(classified.mode),
    internalStrategy: classified.mode,
    reason: `${classified.reason} ${boundaryReason(classified.mode, locale)}`,
    classification: classified
  };
}

function toProductMode(mode: RunMode): 'ask' | 'act' {
  if (mode === 'act' || mode === 'form' || mode === 'full') return 'act';
  return 'ask';
}

function boundaryReason(mode: RunMode, locale: Locale): string {
  if (mode === 'full') {
    return t('mode.boundary.full', locale);
  }
  if (mode === 'act') {
    return t('mode.boundary.act', locale);
  }
  return t('mode.boundary.default', locale);
}
