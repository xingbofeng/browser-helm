import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { StructuredPayload } from './structured-payload';

type TraceLogProps = {
  events: RuntimeEvent[];
};

export function TraceLog({ events }: TraceLogProps) {
  const items = summarizeTraceEvents(events);
  return (
    <section className="bh-traceLog">
      <header className="bh-traceHeader">
        <strong>Trace / 调试日志</strong>
        <span>{items.length} 条</span>
      </header>
      {items.length > 0 ? (
        <ol className="bh-traceItems">
          {items.map((item, index) => (
            <li key={`${item.runId}:${index}`} className="bh-traceItem">
              <div className="bh-traceItemHeader">
                <strong>{item.type}</strong>
                {item.timestamp ? <time>{formatTime(item.timestamp)}</time> : null}
              </div>
              <StructuredPayload value={item.payload ?? {}} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="bh-emptyState">暂无 trace</p>
      )}
    </section>
  );
}

type TraceSummaryItem = RuntimeEvent & {
  payload?: unknown;
};

export function summarizeTraceEvents(events: RuntimeEvent[]): TraceSummaryItem[] {
  const items: TraceSummaryItem[] = [];
  let deltaSummary: {
    runId: string;
    timestamp?: number | undefined;
    count: number;
    charCount: number;
    lastPreview?: string | undefined;
  } | undefined;

  const flushDeltaSummary = () => {
    if (!deltaSummary) {
      return;
    }
    const payload = {
      chunkCount: deltaSummary.count,
      charCount: deltaSummary.charCount,
      ...(deltaSummary.lastPreview ? { lastPreview: deltaSummary.lastPreview } : {})
    };
    items.push({
      runId: deltaSummary.runId,
      type: 'model_stream_delta_summary',
      ...(deltaSummary.timestamp ? { timestamp: deltaSummary.timestamp } : {}),
      payload
    });
    deltaSummary = undefined;
  };

  for (const event of events) {
    if (event.type === 'model_stream_delta') {
      const payload = event.payload as { charCount?: unknown; preview?: unknown } | undefined;
      deltaSummary = {
        runId: event.runId,
        timestamp: event.timestamp,
        count: (deltaSummary?.count ?? 0) + 1,
        charCount: (deltaSummary?.charCount ?? 0) + numberValue(payload?.charCount),
        lastPreview: typeof payload?.preview === 'string'
          ? payload.preview
          : deltaSummary?.lastPreview
      };
      continue;
    }
    flushDeltaSummary();
    items.push(event);
  }
  flushDeltaSummary();
  return items;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
