import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { jsonPreview } from '../lib/format-tool';

type TraceLogProps = {
  events: RuntimeEvent[];
};

export function TraceLog({ events }: TraceLogProps) {
  return (
    <section className="bh-traceLog">
      <h2>Trace / 调试日志</h2>
      <ul>
        {events.map((event, index) => (
          <li key={`${event.runId}:${index}`}>
            <strong>{event.type}</strong>
            <pre>{jsonPreview(event.payload ?? {})}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
