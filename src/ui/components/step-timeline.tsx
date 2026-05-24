import type { TimelineItem } from '../lib/timeline-groups';

type StepTimelineProps = {
  items: Array<Pick<TimelineItem, 'id' | 'type' | 'label'>>;
};

export function StepTimeline({ items }: StepTimelineProps) {
  const displayItems = items.length > 0 ? items : fallbackItems;
  return (
    <section className="bh-stepTimeline" aria-label="Timeline">
      <h2>执行时间线</h2>
      <ol>
        {displayItems.map((item, index) => (
          <li key={item.id} data-event-type={item.type}>
            <span>{index + 1}</span>
            <strong>{item.label}</strong>
            <small>{item.type}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

const fallbackItems: Array<Pick<TimelineItem, 'id' | 'type' | 'label'>> = [
  { id: 'pending-observe', type: 'pending', label: '等待观察' },
  { id: 'pending-tool', type: 'pending', label: '等待工具事件' },
  { id: 'pending-approval', type: 'pending', label: '等待审批事件' }
];
