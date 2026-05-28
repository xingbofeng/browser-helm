import type { RunSnapshot } from '../../../runtime/runtime-messages';
import { t } from '../../../i18n/t';
import type { Locale } from '../../../i18n/types';

export function modeSwitchRequestMessage(
  runId: string,
  locale: Locale
): NonNullable<RunSnapshot['messages']>[number] {
  const now = Date.now();
  return {
    id: `${runId}:mode-switch-request`,
    role: 'agent',
    kind: 'recommendation',
    status: 'complete',
    title: t('runtime.modeSwitch.title', locale),
    content: t('runtime.modeSwitch.askToAct', locale),
    createdAt: now,
    updatedAt: now
  };
}
