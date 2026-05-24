import type { RunDisplayState } from '../stores/agent-store';

const stateLabels: Record<RunDisplayState, string> = {
  idle: '空闲',
  starting: '启动中',
  observing: '观察中',
  thinking: '思考中',
  executing_tool: '执行工具',
  waiting_for_approval: '等待审批',
  waiting_for_user: '等待用户',
  recovering: '恢复中',
  finished: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

type RunStateBadgeProps = {
  state: RunDisplayState;
};

export function RunStateBadge({ state }: RunStateBadgeProps) {
  return <span className={`bh-runState bh-runState-${state}`}>{stateLabels[state]}</span>;
}
