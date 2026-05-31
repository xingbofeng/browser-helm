import {
  AlertCircle,
  Check,
  LoaderCircle,
  Wrench
} from 'lucide-react';

import type { TranslationParams } from '../../i18n/types';
import type { RunSnapshot } from '../../runtime/runtime-messages';

type TFunction = (key: string, params?: TranslationParams) => string;

export type RunProgress = {
  label: string;
  detail: string;
  startedAt: number;
  spinning?: boolean | undefined;
};

export type RunFlowItem = {
  id: string;
  kind: 'reasoning' | 'tool';
  title: string;
  summary: string;
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  endedAt?: number | undefined;
  open: boolean;
};

const MAX_VISIBLE_RUN_FLOW_ITEMS = 3;

export function RunFlowTimeline({ items, t }: { items: RunFlowItem[]; t: TFunction }) {
  const item = items.find((candidate) => candidate.open) ?? items.at(-1);
  if (!item) {
    return null;
  }
  return (
    <section
      className={`bh-runFlow bh-replyStatus is-${item.kind} is-${item.status}`}
      aria-label={t('runFlow.aria')}
      role="status"
      aria-live="polite"
    >
      <span className="bh-replyStatusIcon" aria-hidden="true">
        {iconForRunFlowItem(item)}
      </span>
      <div className="bh-replyStatusBody">
        <div className="bh-replyStatusLine">
          <strong>{titleForRunFlowItem(item, t)}</strong>
          {item.endedAt !== undefined ? <time>{formatDuration(item.startedAt, item.endedAt)}</time> : null}
        </div>
        <p>{item.summary}</p>
      </div>
    </section>
  );
}

function iconForRunFlowItem(item: RunFlowItem) {
  if (item.status === 'running') {
    return <LoaderCircle size={16} className="is-spinning" />;
  }
  if (item.status === 'error') {
    return <AlertCircle size={16} />;
  }
  if (item.kind === 'tool') {
    return <Wrench size={16} />;
  }
  return <Check size={16} />;
}

function titleForRunFlowItem(item: RunFlowItem, t: TFunction): string {
  if (
    item.status === 'error' ||
    item.id.includes('model_stream_fallback_started') ||
    item.id.includes('decision_parse_failed')
  ) {
    return item.title;
  }
  if (item.kind === 'tool') {
    return t('runFlow.toolStatus');
  }
  return t('runFlow.thinkingStatus');
}

export function RunProgressCard({
  progress,
  now
}: {
  progress: RunProgress;
  now: number;
}) {
  const elapsedSeconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  return (
    <article className="bh-runProgressCard" role="status" aria-live="polite">
      <span
        className={`bh-runProgressSpinner${progress.spinning === false ? '' : ' is-spinning'}`}
        aria-hidden="true"
      >
        <LoaderCircle size={17} />
      </span>
      <div>
        <strong>{progress.label}</strong>
        <p>{progress.detail}</p>
      </div>
      <time>{elapsedSeconds}s</time>
    </article>
  );
}

export function buildRunProgress(snapshot: RunSnapshot | undefined, t: TFunction): RunProgress | undefined {
  if (!snapshot || !isActiveRunStatus(snapshot.status)) {
    return undefined;
  }
  const trace = snapshot.trace ?? [];
  const latestToolStarted = [...trace].reverse().find((event) => event.type === 'tool_started');
  if (snapshot.status === 'executing_tool' && latestToolStarted) {
    const payload = recordPayload(latestToolStarted.payload);
    const tool = stringValue(payload.tool) ?? '';
    return {
      label: humanToolLabel(tool, t),
      detail: t('runProgress.executingDetail', { tool }),
      startedAt: latestToolStarted.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'thinking') {
    return thinkingProgressFromTrace(trace, t);
  }
  if (snapshot.status === 'observing') {
    return {
      label: t('runProgress.observing'),
      detail: t('runProgress.observingDetail'),
      startedAt: latestToolStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'recovering') {
    return {
      label: t('runProgress.recovering'),
      detail: t('runProgress.recoveringDetail'),
      startedAt: Date.now()
    };
  }
  return undefined;
}

export function buildRunFlowItems(snapshot: RunSnapshot | undefined, t: TFunction): RunFlowItem[] {
  const fullTrace = snapshot?.trace ?? [];
  if (!fullTrace.some((event) =>
    event.type === 'turn_started' ||
    event.type === 'context_built' ||
    event.type.startsWith('model_stream_') ||
    event.type === 'decision_parse_failed' ||
    event.type === 'model_decision' ||
    event.type === 'tool_started'
  )) {
    return [];
  }
  const latestTurnIndex = findLastTraceIndex(fullTrace, (event) => event.type === 'turn_started');
  const trace = latestTurnIndex >= 0 ? fullTrace.slice(latestTurnIndex) : fullTrace;

  const items: RunFlowItem[] = [];
  let streamItemIndex = -1;
  for (const [index, event] of trace.entries()) {
    const timestamp = event.timestamp ?? Date.now();
    const payload = recordPayload(event.payload);
    if (event.type === 'turn_started') {
      items.push({
        id: `${index}:turn_started`,
        kind: 'reasoning',
        title: t('runFlow.reasoningTitle'),
        summary: t('runProgress.turnStartedDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'context_built') {
      items.push({
        id: `${index}:context_built`,
        kind: 'reasoning',
        title: t('runProgress.contextBuilt'),
        summary: t('runProgress.contextBuiltDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'model_stream_started') {
      items.push({
        id: `${index}:model_stream`,
        kind: 'reasoning',
        title: t('runProgress.modelStreaming'),
        summary: t('runFlow.modelStarted', { model: stringValue(payload.model) ?? 'provider' }),
        status: 'running',
        startedAt: timestamp,
        open: true
      });
      streamItemIndex = items.length - 1;
      continue;
    }
    if (event.type === 'model_stream_delta' && streamItemIndex >= 0) {
      const item = items[streamItemIndex];
      if (item) {
        const deltaSummary = streamDeltaSummaryAt(trace, event);
        item.summary = t('runProgress.modelStreamingDetail', {
          count: String(deltaSummary.charCount)
        });
      }
      continue;
    }
    if (event.type === 'model_stream_finished' && streamItemIndex >= 0) {
      const item = items[streamItemIndex];
      if (item) {
        item.status = 'complete';
        item.endedAt = timestamp;
        item.summary = t('runProgress.readingDecisionDetail');
      }
      streamItemIndex = -1;
      continue;
    }
    if (event.type === 'model_stream_failed') {
      const summary = stringValue(payload.summary) ?? t('trace.summary.runFailed');
      const item = streamItemIndex >= 0 ? items[streamItemIndex] : undefined;
      if (item) {
        item.status = 'error';
        item.endedAt = timestamp;
        item.summary = t('runFlow.modelFailed', { summary });
      } else {
        items.push({
          id: `${index}:model_stream_failed`,
          kind: 'reasoning',
          title: t('trace.event.modelFailed'),
          summary: t('runFlow.modelFailed', { summary }),
          status: 'error',
          startedAt: timestamp,
          endedAt: timestamp,
          open: true
        });
      }
      streamItemIndex = -1;
      continue;
    }
    if (event.type === 'model_stream_fallback_started') {
      const reason = stringValue(payload.reason) ?? t('trace.summary.noDetail');
      items.push({
        id: `${index}:model_stream_fallback_started`,
        kind: 'reasoning',
        title: t('runFlow.fallbackTitle'),
        summary: t('runFlow.fallbackDetail', { reason }),
        status: 'running',
        startedAt: timestamp,
        open: true
      });
      continue;
    }
    if (event.type === 'decision_parse_failed') {
      items.push({
        id: `${index}:decision_parse_failed`,
        kind: 'reasoning',
        title: t('runFlow.repairTitle'),
        summary: t('runFlow.repairDetail'),
        status: 'error',
        startedAt: timestamp,
        endedAt: timestamp,
        open: true
      });
      continue;
    }
    if (event.type === 'model_decision') {
      items.push({
        id: `${index}:model_decision`,
        kind: 'reasoning',
        title: t('runProgress.preparingAction'),
        summary: t('runProgress.preparingActionDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'tool_started') {
      if (streamItemIndex >= 0) {
        const item = items[streamItemIndex];
        if (item) {
          item.status = 'complete';
          item.endedAt = timestamp;
          item.summary = t('runProgress.readingDecisionDetail');
        }
        streamItemIndex = -1;
      }
      const tool = stringValue(payload.tool) ?? t('trace.event.unknownTool');
      items.push({
        id: `${index}:tool_started:${tool}`,
        kind: 'tool',
        title: tool,
        summary: t('runFlow.toolStarted', { tool }),
        status: 'running',
        startedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'tool_result') {
      const tool = stringValue(payload.tool) ?? t('trace.event.unknownTool');
      const pending = findLastPendingToolItem(items, tool);
      const ok = payload.ok !== false;
      const summary = stringValue(payload.summary) ?? stringValue(payload.code) ?? t('trace.summary.toolReturned');
      if (pending) {
        pending.status = ok ? 'complete' : 'error';
        pending.endedAt = timestamp;
        pending.summary = ok
          ? t('trace.summary.toolResultDone', { summary })
          : t('trace.summary.toolResultFailed', { summary });
      } else {
        items.push({
          id: `${index}:tool_result:${tool}`,
          kind: 'tool',
          title: tool,
          summary,
          status: ok ? 'complete' : 'error',
          startedAt: timestamp,
          endedAt: timestamp,
          open: false
        });
      }
    }
  }

  const visibleItems = compactRunFlowItems(items, t);
  const focusIndex = findFocusedRunFlowItemIndex(visibleItems);
  return visibleItems.map((item, index) => ({
    ...item,
    open: index === focusIndex
  }));
}

function compactRunFlowItems(items: RunFlowItem[], t: TFunction): RunFlowItem[] {
  const meaningful = items.filter((item) =>
    item.kind === 'tool' ||
    item.title !== t('runFlow.reasoningTitle')
  );
  const focusedIndex = findFocusedRunFlowItemIndex(meaningful);
  if (focusedIndex < 0) {
    return meaningful.slice(-MAX_VISIBLE_RUN_FLOW_ITEMS);
  }
  const start = Math.max(0, focusedIndex - (MAX_VISIBLE_RUN_FLOW_ITEMS - 1));
  return meaningful.slice(start, focusedIndex + 1);
}

function findFocusedRunFlowItemIndex(items: RunFlowItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const status = items[index]?.status;
    if (status === 'running' || status === 'error') {
      return index;
    }
  }
  return items.length - 1;
}

function findLastTraceIndex(
  trace: NonNullable<RunSnapshot['trace']>,
  predicate: (event: NonNullable<RunSnapshot['trace']>[number]) => boolean
): number {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (event && predicate(event)) {
      return index;
    }
  }
  return -1;
}

function findLastPendingToolItem(items: RunFlowItem[], tool: string): RunFlowItem | undefined {
  return [...items].reverse().find((item) =>
    item.kind === 'tool' &&
    item.title === tool &&
    item.status === 'running'
  );
}

function thinkingProgressFromTrace(trace: NonNullable<RunSnapshot['trace']>, t: TFunction): RunProgress {
  const postFillProgress = postFillProgressFromTrace(trace, t);
  if (postFillProgress) {
    return postFillProgress;
  }
  const event = [...trace].reverse().find((item) =>
    item.type === 'turn_started' ||
    item.type === 'tools_selected' ||
    item.type === 'context_built' ||
    item.type === 'model_stream_started' ||
    item.type === 'model_stream_delta' ||
    item.type === 'model_stream_finished' ||
    item.type === 'decision_parse_failed' ||
    item.type === 'model_decision'
  );
  if (event?.type === 'context_built') {
    return {
      label: t('runProgress.contextBuilt'),
      detail: t('runProgress.contextBuiltDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'tools_selected') {
    return {
      label: t('runProgress.toolsSelected'),
      detail: t('runProgress.toolsSelectedDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_finished') {
    const payload = recordPayload(event.payload);
    return {
      label: t('trace.event.modelFinished'),
      detail: t('trace.summary.modelFinished', {
        chars: String(numberValue(payload.charCount) ?? 0)
      }),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_started') {
    const payload = recordPayload(event.payload);
    return {
      label: t('trace.event.modelStarted'),
      detail: t('trace.summary.modelStarted', { model: stringValue(payload.model) ?? 'provider' }),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_delta') {
    const streamStarted = latestEventAtOrBefore(trace, 'model_stream_started', event.timestamp);
    const deltaSummary = streamDeltaSummaryAt(trace, event);
    return {
      label: t('trace.event.modelDelta'),
      detail: t('trace.summary.modelDelta', {
        chunks: String(deltaSummary.chunkCount),
        chars: String(deltaSummary.charCount)
      }),
      startedAt: streamStarted?.timestamp ?? event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'decision_parse_failed') {
    return {
      label: event.type,
      detail: summarizeProgressPayload(recordPayload(event.payload), t),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_decision') {
    return {
      label: t('runProgress.preparingAction'),
      detail: t('runProgress.preparingActionDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'turn_started') {
    return {
      label: t('runProgress.turnStarted'),
      detail: t('runProgress.turnStartedDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  return {
    label: t('runProgress.turnStarted'),
    detail: t('runProgress.turnStartedDetail'),
    startedAt: event?.timestamp ?? Date.now()
  };
}

function streamDeltaSummaryAt(
  trace: NonNullable<RunSnapshot['trace']>,
  currentEvent: NonNullable<RunSnapshot['trace']>[number]
): { chunkCount: number; charCount: number } {
  const currentTimestamp = currentEvent.timestamp ?? Number.POSITIVE_INFINITY;
  let chunkCount = 0;
  let charCount = 0;
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (!event || (event.timestamp ?? 0) > currentTimestamp) {
      continue;
    }
    if (event.type === 'model_stream_delta') {
      chunkCount += 1;
      charCount += numberValue(recordPayload(event.payload).charCount) ?? 0;
      continue;
    }
    if (event.type === 'model_stream_started') {
      break;
    }
    if (chunkCount > 0) {
      break;
    }
  }
  return { chunkCount, charCount };
}

function summarizeProgressPayload(payload: Record<string, unknown>, t: TFunction): string {
  const summary = stringValue(payload.summary) ?? stringValue(payload.message);
  if (summary) {
    return summary;
  }
  const keys = Object.keys(payload);
  return keys.length
    ? t('trace.summary.payloadFields', { count: String(keys.length), list: keys.slice(0, 4).join('、') })
    : t('trace.summary.noDetail');
}

function postFillProgressFromTrace(trace: NonNullable<RunSnapshot['trace']>, t: TFunction): RunProgress | undefined {
  const latestFillResult = [...trace].reverse().find((event) => {
    if (event.type !== 'tool_result') return false;
    const payload = recordPayload(event.payload);
    const result = recordPayload(payload.result);
    const tool = stringValue(payload.tool) ?? stringValue(result.tool) ?? '';
    const ok = typeof payload.ok === 'boolean' ? payload.ok : result.ok;
    return tool.includes('form_fill') && ok !== false;
  });
  if (!latestFillResult) {
    return undefined;
  }
  const latestVerifyAfterFill = [...trace].reverse().find((event) => {
    if ((event.timestamp ?? 0) <= (latestFillResult.timestamp ?? 0)) return false;
    if (event.type !== 'tool_started' && event.type !== 'tool_result') return false;
    const payload = recordPayload(event.payload);
    const result = recordPayload(payload.result);
    const tool = stringValue(payload.tool) ?? stringValue(result.tool) ?? '';
    return tool.includes('form_verify');
  });
  if (latestVerifyAfterFill) {
    return undefined;
  }
  return {
    label: t('runProgress.confirmingFill'),
    detail: t('runProgress.confirmingFillDetail'),
    startedAt: latestFillResult.timestamp ?? Date.now()
  };
}

function isActiveRunStatus(status: RunSnapshot['status']): boolean {
  return status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'recovering';
}

function humanToolLabel(tool: string, t: TFunction): string {
  if (tool.includes('page_observe')) return t('tool.running.observe');
  if (tool.includes('page_read_article')) return t('tool.running.readArticle');
  if (tool.includes('page_read_visible_text')) return t('tool.running.readVisibleText');
  if (tool.includes('iframe_list')) return t('tool.running.iframeList');
  if (tool.includes('iframe_read')) return t('tool.running.iframeRead');
  if (tool.includes('viewport_scroll')) return t('tool.running.viewportScroll');
  if (tool.includes('form_infer_fill_plan')) return t('tool.running.formInferPlan');
  if (tool.includes('form_fill')) return t('tool.running.formFill');
  if (tool.includes('form_verify')) return t('tool.running.formVerify');
  if (tool.includes('form_submit')) return t('tool.running.formSubmit');
  return t('tool.running.default');
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function latestEventAtOrBefore(
  trace: NonNullable<RunSnapshot['trace']>,
  type: string,
  timestamp: number | undefined
): NonNullable<RunSnapshot['trace']>[number] | undefined {
  return [...trace].reverse().find((event) =>
    event.type === type &&
    (timestamp === undefined || (event.timestamp ?? 0) <= timestamp)
  );
}

function formatDuration(startedAt: number, endedAt: number): string {
  return `${Math.max(0, endedAt - startedAt)} ms`;
}
