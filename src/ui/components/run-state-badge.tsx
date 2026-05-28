import type { RunDisplayState } from '../stores/agent-store';
import type { TranslationKey } from '../../i18n/types';
import { useT } from '../../i18n/context';

type RunStateBadgeProps = {
  state: RunDisplayState;
};

const RUN_STATE_KEY = {
  idle: 'runState.idle',
  starting: 'runState.starting',
  observing: 'runState.observing',
  thinking: 'runState.thinking',
  executing_tool: 'runState.executingTool',
  waiting_for_approval: 'runState.waitingApproval',
  waiting_for_user: 'runState.waitingUser',
  recovering: 'runState.recovering',
  finished: 'runState.finished',
  failed: 'runState.failed',
  cancelled: 'runState.cancelled',
} as const satisfies Record<RunDisplayState, TranslationKey>;

export function RunStateBadge({ state }: RunStateBadgeProps) {
  const t = useT();
  return <span className={`bh-runState bh-runState-${state}`}>{t(RUN_STATE_KEY[state])}</span>;
}
