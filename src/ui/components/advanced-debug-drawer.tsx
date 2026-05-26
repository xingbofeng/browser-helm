import { Bug, Download, ListTree, MousePointerClick, RadioTower, Wrench } from 'lucide-react';
import { Button } from 'animal-island-ui';
import { useMemo, useState } from 'react';

import type { RunSnapshot, RuntimeEvent } from '../../runtime/runtime-messages';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { jsonPreview } from '../lib/format-tool';
import {
  mergeElementsAndForms,
  type ElementsFormsRow
} from '../lib/merge-elements-forms';
import { ToolInspector } from './tool-inspector';
import { TraceLog, summarizeTraceEvents } from './trace-log';

type AdvancedDebugDrawerProps = {
  snapshot?: RunSnapshot | undefined;
  structuredPageData: StructuredPageData;
  onInspectElement?: ((refId: string) => void) | undefined;
};

const filterChips = ['全部', '表单字段', '按钮', '异常', '禁用'] as const;
const debugTabs = [
  { key: 'trace', label: 'Trace', icon: ListTree },
  { key: 'tools', label: '工具', icon: Wrench },
  { key: 'elements', label: '元素与表单', icon: MousePointerClick },
  { key: 'streaming', label: 'Streaming', icon: RadioTower }
] as const;
type DebugTabKey = (typeof debugTabs)[number]['key'];

export function AdvancedDebugDrawer({
  snapshot,
  structuredPageData
}: AdvancedDebugDrawerProps) {
  const [open, setOpen] = useState(() =>
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('browserhelm.debug.open') === 'true'
      : false
  );
  const [activeTab, setActiveTab] = useState<DebugTabKey>('trace');

  const setOpenAndPersist = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('browserhelm.debug.open', String(nextOpen));
    }
  };

  return (
    <section className="bh-debugDrawer" data-open={open}>
      <Button
        htmlType="button"
        className="bh-debugToggle"
        type="default"
        icon={<Bug size={16} />}
        onClick={() => setOpenAndPersist(!open)}
      >
        高级开发者选项
      </Button>
      {open ? (
        <AdvancedDebugPanel
          snapshot={snapshot}
          structuredPageData={structuredPageData}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onInspectElement={undefined}
        />
      ) : null}
    </section>
  );
}

export function AdvancedDebugPanel({
  snapshot,
  structuredPageData,
  activeTab,
  onTabChange,
  onInspectElement
}: AdvancedDebugDrawerProps & {
  activeTab: DebugTabKey;
  onTabChange: (tab: DebugTabKey) => void;
}) {
  return (
    <div className="bh-debugPanel">
      <DebugSummary snapshot={snapshot} structuredPageData={structuredPageData} />
      <div className="bh-debugTabs" aria-label="高级开发者选项">
        {debugTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              aria-label={tab.label}
              aria-pressed={activeTab === tab.key}
              onClick={() => onTabChange(tab.key)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      {activeTab === 'trace' ? <TraceTab snapshot={snapshot} /> : null}
      {activeTab === 'tools' ? <ToolTab snapshot={snapshot} /> : null}
      {activeTab === 'elements' ? (
        <ElementsFormsTab
          data={structuredPageData}
          onInspectElement={onInspectElement}
        />
      ) : null}
      {activeTab === 'streaming' ? <StreamingTab snapshot={snapshot} /> : null}
    </div>
  );
}

function DebugSummary(props: {
  snapshot?: RunSnapshot | undefined;
  structuredPageData: StructuredPageData;
}) {
  const observation = props.snapshot?.observation;
  const streaming = props.snapshot?.streaming;
  return (
    <div className="bh-debugSummary">
      <span>{observation?.currentDomain ?? '未观察页面'}</span>
      <span>{props.snapshot?.mode ?? 'ask'} / {props.snapshot?.status ?? 'idle'}</span>
      <span>元素 {props.structuredPageData.interactive.count}</span>
      <span>表单 {props.structuredPageData.forms.count}</span>
      <span>警告 {props.structuredPageData.observation.warnings.length}</span>
      <span>{streaming?.enabled ? 'Streaming on' : 'Streaming off'}</span>
    </div>
  );
}

function TraceTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  return (
    <div className="bh-debugTab">
      <div className="bh-debugTabHeader">
        <ListTree size={16} />
        <strong>事件摘要</strong>
        <span className="bh-debugTabActions">
          <DownloadTraceButton events={snapshot?.trace ?? []} />
        </span>
      </div>
      <TraceLog events={snapshot?.trace ?? []} />
    </div>
  );
}

function ToolTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  return (
    <div className="bh-debugTab">
      <div className="bh-debugTabHeader">
        <Wrench size={16} />
        <strong>工具结果</strong>
      </div>
      <ToolInspector
        toolResult={snapshot?.toolResult}
        argsPreview={snapshot?.pendingApproval?.argsPreview}
      />
    </div>
  );
}

function ElementsFormsTab({
  data,
  onInspectElement
}: {
  data: StructuredPageData;
  onInspectElement?: ((refId: string) => void) | undefined;
}) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<(typeof filterChips)[number]>('全部');
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>();
  const rows = useMemo(() => mergeElementsAndForms(data), [data]);
  const filteredRows = rows.filter((row) => matchRow(row, query, chip));
  const selected = filteredRows.find((row) => row.id === selectedRowId) ?? filteredRows[0];
  const selectRow = (row: ElementsFormsRow) => {
    setSelectedRowId(row.id);
    onInspectElement?.(row.refId);
  };

  return (
    <div className="bh-elementsFormsTab">
      <div className="bh-filterBar">
        <input
          aria-label="搜索元素与表单"
          placeholder="搜索名称、标签、role 或 ref"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <div className="bh-chipRow" aria-label="元素与表单过滤">
          {filterChips.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={chip === item}
              onClick={() => setChip(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="bh-elementList" role="list" aria-label="元素与表单结果">
        {filteredRows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="bh-elementListItem"
            aria-pressed={row.id === selected?.id}
            onClick={() => selectRow(row)}
          >
            <span className="bh-elementItemHeader">
              <strong>{row.label}</strong>
              <code>{row.refId}</code>
            </span>
            <span className="bh-elementItemMeta">
              <span>{row.type}</span>
              <span>{row.roleTag}</span>
              <span>{row.state}</span>
              <span>{row.validation}</span>
            </span>
          </button>
        ))}
      </div>
      {selected ? <ElementDetail row={selected} /> : null}
    </div>
  );
}

function ElementDetail({ row }: { row: ElementsFormsRow }) {
  return (
    <article className="bh-detailPanel">
      <header>
        <h3>选中详情</h3>
        <code>{row.refId}</code>
      </header>
      <dl>
        <div><dt>名称</dt><dd>{row.label}</dd></div>
        <div><dt>状态</dt><dd>visible={String(row.visible)} disabled={String(row.disabled)}</dd></div>
        <div><dt>约束</dt><dd>required={String(row.required ?? false)}</dd></div>
        <div><dt>校验</dt><dd>{row.validationMessage ?? row.validation}</dd></div>
        <div><dt>提交原因</dt><dd>{row.submitReason ?? '无阻塞'}</dd></div>
      </dl>
    </article>
  );
}

function StreamingTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  const streaming = snapshot?.streaming;
  const streamEvents = (snapshot?.trace ?? []).filter((event) =>
    event.type.startsWith('model_stream_')
  );
  const duration = streaming?.startedAt && streaming.finishedAt
    ? `${Math.max(0, streaming.finishedAt - streaming.startedAt)}ms`
    : streaming?.active
      ? '进行中'
      : '-';
  return (
    <div className="bh-streamingTab">
      <div className="bh-debugTabHeader">
        <RadioTower size={16} />
        <strong>Streaming 状态</strong>
      </div>
      <dl className="bh-streamingMetrics">
        <div><dt>Provider</dt><dd>{streaming?.provider ?? '-'}</dd></div>
        <div><dt>Model</dt><dd>{streaming?.model ?? '-'}</dd></div>
        <div><dt>启用</dt><dd>{String(streaming?.enabled ?? false)}</dd></div>
        <div><dt>进行中</dt><dd>{String(streaming?.active ?? false)}</dd></div>
        <div><dt>Chunk</dt><dd>{streaming?.chunkCount ?? 0}</dd></div>
        <div><dt>耗时</dt><dd>{duration}</dd></div>
        <div><dt>Fallback</dt><dd>{String(streaming?.fallbackUsed ?? false)}</dd></div>
      </dl>
      {streaming?.fallbackReason ? <p>{streaming.fallbackReason}</p> : null}
      {streaming?.finalText ? (
        <article className="bh-streamPreview">
          <h3>Final preview</h3>
          <p>{streaming.finalText}</p>
        </article>
      ) : null}
      <pre>{jsonPreview(streamEvents.map((event) => ({
        type: event.type,
        provider: streaming?.provider,
        model: streaming?.model,
        payload: event.payload
      })))}</pre>
    </div>
  );
}

function DownloadTraceButton({ events }: { events: RuntimeEvent[] }) {
  const handleDownload = () => {
    if (events.length === 0) return;
    // 和 UI 一样聚合 delta 事件，避免 68 个 chunk 导出 68 行噪点
    const summarized = summarizeTraceEvents(events);
    const jsonl = summarized
      .map((event) => JSON.stringify(event))
      .join('\n');
    const blob = new Blob([jsonl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const runId = events[0]?.runId ?? 'unknown';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.download = `browserhelm-trace-${runId}-${date}.jsonl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      className="bh-debugActionButton"
      aria-label="下载 trace JSONL"
      disabled={events.length === 0}
      onClick={handleDownload}
    >
      <Download size={14} />
    </button>
  );
}

function matchRow(
  row: ElementsFormsRow,
  query: string,
  chip: (typeof filterChips)[number]
): boolean {
  const normalized = query.trim().toLowerCase();
  const chipMatched =
    chip === '全部' ||
    (chip === '表单字段' && row.type === 'form-field') ||
    (chip === '按钮' && row.type === 'button') ||
    (chip === '异常' && row.validation !== '-' && !row.validation.includes('通过')) ||
    (chip === '禁用' && row.disabled);
  if (!chipMatched) {
    return false;
  }
  if (!normalized) {
    return true;
  }
  return [row.type, row.label, row.roleTag, row.state, row.validation, row.refId]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}
