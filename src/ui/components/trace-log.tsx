import type { RuntimeEvent } from '../../runtime/runtime-messages';
import { toolDescription } from '../../shared/tool-descriptions';
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
                <strong>{traceTitle(item)}</strong>
                {item.timestamp ? <time>{formatTime(item.timestamp)}</time> : null}
              </div>
              <p className="bh-traceSummary">{traceSummary(item)}</p>
              {traceToolDescription(item) ? (
                <p className="bh-traceToolDescription">{traceToolDescription(item)}</p>
              ) : null}
              <details className="bh-traceDetails">
                <summary>查看原始详情</summary>
                <StructuredPayload value={item.payload ?? {}} maxDepth={3} />
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="bh-emptyState">暂无 trace</p>
      )}
    </section>
  );
}

function traceToolDescription(event: TraceSummaryItem): string | undefined {
  if (event.type !== 'tool_started' && event.type !== 'tool_result') {
    return undefined;
  }
  return toolDescription(stringValue(recordPayload(event.payload).tool));
}

function traceTitle(event: TraceSummaryItem): string {
  const payload = recordPayload(event.payload);
  if (event.type === 'run_started') return '开始任务';
  if (event.type === 'tool_started') return `调用工具：${stringValue(payload.tool) ?? '未知工具'}`;
  if (event.type === 'tool_result') return `工具结果：${stringValue(payload.tool) ?? '未知工具'}`;
  if (event.type === 'model_stream_started') return '开始生成回复';
  if (event.type === 'model_stream_delta_summary') return '生成中';
  if (event.type === 'model_stream_finished') return '回复生成完成';
  if (event.type === 'run_finished') return '任务完成';
  if (event.type === 'run_failed') return '任务失败';
  if (event.type === 'plan_updated') return '计划更新';
  if (event.type === 'context_built') return '构建上下文';
  if (event.type === 'context_compacted') return '压缩上下文';
  return event.type;
}

function traceSummary(event: TraceSummaryItem): string {
  const payload = recordPayload(event.payload);
  if (event.type === 'run_started') {
    return `目标：${stringValue(payload.task) ?? '未命名任务'}。模式：${stringValue(payload.mode) ?? 'ask'}。`;
  }
  if (event.type === 'tool_started') {
    return `BrowserHelm 正在执行 ${stringValue(payload.tool) ?? '工具'}。`;
  }
  if (event.type === 'tool_result') {
    const status = payload.ok === false ? '失败' : '完成';
    return `${status}：${stringValue(payload.summary) ?? stringValue(payload.code) ?? '工具已返回结果'}。`;
  }
  if (event.type === 'model_stream_started') {
    return `模型 ${stringValue(payload.model) ?? 'provider'} 开始输出。`;
  }
  if (event.type === 'model_stream_delta_summary') {
    return `已收到 ${numberValue(payload.chunkCount)} 个片段，约 ${numberValue(payload.charCount)} 字符。`;
  }
  if (event.type === 'model_stream_finished') {
    return `生成完成，约 ${numberValue(payload.charCount)} 字符。`;
  }
  if (event.type === 'run_failed') {
    return stringValue(payload.message) ?? stringValue(payload.summary) ?? '运行未完成。';
  }
  if (event.type === 'plan_updated') {
    return 'Agent 已更新当前目标和执行步骤。';
  }
  if (event.type === 'context_built') {
    return `已构建 ${numberValue(payload.messageCount)} 条上下文消息。`;
  }
  if (event.type === 'context_compacted') {
    return `保留 ${numberValue(payload.retainedStepCount)} 步，丢弃 ${numberValue(payload.droppedStepCount)} 步。`;
  }
  return summarizePayload(payload);
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function summarizePayload(payload: Record<string, unknown>): string {
  const summary = stringValue(payload.summary) ?? stringValue(payload.message);
  if (summary) return summary;
  const keys = Object.keys(payload);
  return keys.length ? `包含 ${keys.length} 个字段：${keys.slice(0, 4).join('、')}` : '无附加详情。';
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
