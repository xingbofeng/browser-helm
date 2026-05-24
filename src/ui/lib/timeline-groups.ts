import type { RuntimeEvent } from '../../runtime/runtime-messages';

export type TimelineItem = {
  id: string;
  type: string;
  label: string;
  event: RuntimeEvent;
};

const eventLabels: Record<string, string> = {
  run_started: 'Run started',
  run_finished: 'Run finished',
  run_failed: 'Run failed',
  run_cancelled: 'Run cancelled',
  approval_required: 'Approval required',
  approval_approved: 'Approval approved',
  approval_denied: 'Approval denied',
  tool_result: 'Tool result',
  tool_started: 'Tool started',
  tool_failed: 'Tool failed'
};

export function toTimelineItems(events: RuntimeEvent[]): TimelineItem[] {
  return events.map((event, index) => ({
    id: `${event.runId}:${index}`,
    type: event.type,
    label: eventLabels[event.type] ?? event.type,
    event
  }));
}
