import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { toolDescription } from '../../i18n/tool-descriptions';
import { StructuredPayload } from './structured-payload';

import { useLocale, useT } from '../../i18n/context';
import type { Locale } from '../../i18n/types';

type TraceLogProps = {
  events: RuntimeEvent[];
};

export function TraceLog({ events }: TraceLogProps) {
  const t = useT();
  const locale = useLocale();
  const items = summarizeTraceEvents(events);
  return (
    <section className="bh-traceLog">
      <header className="bh-traceHeader">
        <strong>{t('trace.header')}</strong>
        <span>{t('trace.count', { count: String(items.length) })}</span>
      </header>
      {items.length > 0 ? (
        <ol className="bh-traceItems">
          {items.map((item, index) => (
            <li key={`${item.runId}:${index}`} className="bh-traceItem">
              <div className="bh-traceItemHeader">
                <strong>{traceTitle(item, t)}</strong>
                {item.timestamp ? <time>{formatTime(item.timestamp)}</time> : null}
              </div>
              <p className="bh-traceSummary">{traceSummary(item, t)}</p>
              {traceToolDescription(item, locale) ? (
                <p className="bh-traceToolDescription">{traceToolDescription(item, locale)}</p>
              ) : null}
              <details className="bh-traceDetails">
                <summary>{t('trace.viewDetails')}</summary>
                <StructuredPayload value={item.payload ?? {}} maxDepth={3} />
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="bh-emptyState">{t('trace.empty')}</p>
      )}
    </section>
  );
}

function traceToolDescription(event: TraceSummaryItem, locale: Locale): string | undefined {
  if (event.type !== 'tool_started' && event.type !== 'tool_result') {
    return undefined;
  }
  return toolDescription(stringValue(recordPayload(event.payload).tool), locale);
}

function traceTitle(event: TraceSummaryItem, t: ReturnType<typeof useT>): string {
  const payload = recordPayload(event.payload);
  if (event.type === 'run_started') return t('trace.event.runStarted');
  if (event.type === 'tool_started') return t('trace.event.toolStarted', { tool: stringValue(payload.tool) ?? t('trace.event.unknownTool') });
  if (event.type === 'tool_result') return t('trace.event.toolResult', { tool: stringValue(payload.tool) ?? t('trace.event.unknownTool') });
  if (event.type === 'model_stream_started') return t('trace.event.modelStarted');
  if (event.type === 'model_stream_delta_summary') return t('trace.event.modelDelta');
  if (event.type === 'model_stream_finished') return t('trace.event.modelFinished');
  if (event.type === 'run_finished') return t('trace.event.runFinished');
  if (event.type === 'run_failed') return t('trace.event.runFailed');
  if (event.type === 'plan_updated') return t('trace.event.planUpdated');
  if (event.type === 'context_built') return t('trace.event.contextBuilt');
  if (event.type === 'context_compacted') return t('trace.event.contextCompacted');
  return event.type;
}

function traceSummary(event: TraceSummaryItem, t: ReturnType<typeof useT>): string {
  const payload = recordPayload(event.payload);
  if (event.type === 'run_started') {
    return t('trace.summary.runStarted', {
      task: stringValue(payload.task) ?? t('trace.summary.unnamedTask'),
      mode: stringValue(payload.mode) ?? 'ask',
    });
  }
  if (event.type === 'tool_started') {
    return t('trace.summary.toolStartedStr', { tool: stringValue(payload.tool) ?? 'tool' });
  }
  if (event.type === 'tool_result') {
    const summary = stringValue(payload.summary) ?? stringValue(payload.code) ?? t('trace.summary.toolReturned');
    return payload.ok === false
      ? t('trace.summary.toolResultFailed', { summary })
      : t('trace.summary.toolResultDone', { summary });
  }
  if (event.type === 'model_stream_started') {
    return t('trace.summary.modelStarted', { model: stringValue(payload.model) ?? 'provider' });
  }
  if (event.type === 'model_stream_delta_summary') {
    return t('trace.summary.modelDelta', {
      chunks: String(numberValue(payload.chunkCount)),
      chars: String(numberValue(payload.charCount)),
    });
  }
  if (event.type === 'model_stream_finished') {
    return t('trace.summary.modelFinished', { chars: String(numberValue(payload.charCount)) });
  }
  if (event.type === 'run_failed') {
    return stringValue(payload.message) ?? stringValue(payload.summary) ?? t('trace.summary.runFailed');
  }
  if (event.type === 'plan_updated') {
    return t('trace.summary.planUpdated');
  }
  if (event.type === 'context_built') {
    return t('trace.summary.contextBuilt', { count: String(numberValue(payload.messageCount)) });
  }
  if (event.type === 'context_compacted') {
    return t('trace.summary.contextCompacted', {
      retained: String(numberValue(payload.retainedStepCount)),
      dropped: String(numberValue(payload.droppedStepCount)),
    });
  }
  return summarizePayload(payload, t);
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function summarizePayload(payload: Record<string, unknown>, t: ReturnType<typeof useT>): string {
  const summary = stringValue(payload.summary) ?? stringValue(payload.message);
  if (summary) return summary;
  const keys = Object.keys(payload);
  return keys.length
    ? t('trace.summary.payloadFields', { count: String(keys.length), list: keys.slice(0, 4).join('、') })
    : t('trace.summary.noDetail');
}

type TraceSummaryItem = Omit<RuntimeEvent, 'type'> & {
  type: RuntimeEvent['type'] | 'model_stream_delta_summary';
  payload?: Record<string, unknown> | undefined;
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
