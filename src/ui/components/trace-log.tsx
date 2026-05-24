import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { jsonPreview } from '../lib/format-tool';

type TraceLogProps = {
  events: RuntimeEvent[];
};

export function TraceLog({ events }: TraceLogProps) {
  return (
    <section className="bh-traceLog">
      <details>
        <summary>Trace / 调试日志（{events.length} 条）</summary>
        <ul>
          {events.map((event, index) => (
            <li key={`${event.runId}:${index}`}>
              <strong>{event.type}</strong>
              <pre>{jsonPreview(event.payload ?? {})}</pre>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
