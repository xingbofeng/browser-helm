import type { TimelineItem } from '../lib/timeline-groups';

type StepTimelineProps = {
  items: Array<Pick<TimelineItem, 'id' | 'type' | 'label'>>;
};

export function StepTimeline({ items }: StepTimelineProps) {
  return (
    <section className="bh-stepTimeline" aria-label="Timeline">
      <h2>Timeline</h2>
      <ol>
        {items.map((item) => (
          <li key={item.id} data-event-type={item.type}>
            {item.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
