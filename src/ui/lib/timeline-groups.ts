import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { APPROVAL_EVENT_NAMES, TRACE_EVENT_NAMES } from '../../shared/constants/event-names';

export type TimelineItem = {
  id: string;
  type: string;
  label: string;
  event: RuntimeEvent;
};

const eventLabels: Record<string, string> = {
  [TRACE_EVENT_NAMES.RUN_STARTED]: 'Run 开始',
  [TRACE_EVENT_NAMES.RUN_FINISHED]: 'Run 结束',
  [TRACE_EVENT_NAMES.RUN_FAILED]: 'Run 失败',
  [TRACE_EVENT_NAMES.RUN_CANCELLED]: '用户停止',
  [TRACE_EVENT_NAMES.APPROVAL_REQUIRED]: '等待审批',
  [APPROVAL_EVENT_NAMES.APPROVED]: '审批通过',
  [APPROVAL_EVENT_NAMES.DENIED]: '审批拒绝',
  [TRACE_EVENT_NAMES.TOOL_RESULT]: '工具结果',
  [TRACE_EVENT_NAMES.TOOL_STARTED]: '工具开始',
  [TRACE_EVENT_NAMES.TOOL_FAILED]: '工具失败',
  [TRACE_EVENT_NAMES.STATE_CHANGED]: '状态变化'
};

export function toTimelineItems(events: RuntimeEvent[]): TimelineItem[] {
  return events.map((event, index) => ({
    id: `${event.runId}:${index}`,
    type: event.type,
    label: eventLabels[event.type] ?? event.type,
    event
  }));
}
