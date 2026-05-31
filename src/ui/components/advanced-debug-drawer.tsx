import { Bug, Download, ListTree, MousePointerClick, RadioTower, Wrench } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Button } from 'animal-island-ui';
import { useMemo, useState } from 'react';
import { useT, useLocale } from '../../i18n/context';

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

type FilterChipKey = 'all' | 'formField' | 'button' | 'error' | 'disabled';

function filterChips(t: ReturnType<typeof useT>) {
  return [
    { key: 'all', label: t('debug.elements.filterAll') },
    { key: 'formField', label: t('debug.elements.filterFormField') },
    { key: 'button', label: t('debug.elements.filterButton') },
    { key: 'error', label: t('debug.elements.filterError') },
    { key: 'disabled', label: t('debug.elements.filterDisabled') }
  ] as const;
}

function debugTabs(t: ReturnType<typeof useT>) {
  return [
    { key: 'trace', label: t('debug.tab.trace'), icon: ListTree },
    { key: 'tools', label: t('debug.tab.tools'), icon: Wrench },
    { key: 'elements', label: t('debug.tab.elements'), icon: MousePointerClick },
    { key: 'form', label: t('debug.tab.form'), icon: FileText },
    { key: 'streaming', label: t('debug.tab.streaming'), icon: RadioTower }
  ] as const;
}
type DebugTabKey = ReturnType<typeof debugTabs>[number]['key'];

export function AdvancedDebugDrawer({
  snapshot,
  structuredPageData,
  onInspectElement
}: AdvancedDebugDrawerProps) {
  const t = useT();
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
        {t('debug.title')}
      </Button>
      {open ? (
        <AdvancedDebugPanel
          snapshot={snapshot}
          structuredPageData={structuredPageData}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onInspectElement={onInspectElement}
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
  const t = useT();
  const tabs = debugTabs(t);

  return (
    <div className="bh-debugPanel">
      <DebugSummary snapshot={snapshot} structuredPageData={structuredPageData} />
      <div className="bh-debugTabs" aria-label={t('debug.tab.aria')}>
        {tabs.map((tab) => {
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
      {activeTab === 'form' ? <FormExecutionTab snapshot={snapshot} /> : null}
    </div>
  );
}

function DebugSummary(props: {
  snapshot?: RunSnapshot | undefined;
  structuredPageData: StructuredPageData;
}) {
  const t = useT();
  const observation = props.snapshot?.observation;
  const streaming = props.snapshot?.streaming;
  const debugLimitations = [
    ...(props.snapshot?.capabilityLimitations ?? []),
    ...(props.snapshot?.debugReport?.limitations ?? [])
  ];
  const showDebugBoundary = props.snapshot?.mode === 'debug' || debugLimitations.length > 0;
  return (
    <div className="bh-debugSummary">
      <span>{observation?.currentDomain ?? t('debug.notObserved')}</span>
      <span>{props.snapshot?.mode ?? 'ask'} / {props.snapshot?.status ?? 'idle'}</span>
      <span>{t('debug.elements.elementCount', { count: String(props.structuredPageData.interactive.count) })}</span>
      <span>{t('debug.elements.formCount', { count: String(props.structuredPageData.forms.count) })}</span>
      <span>{t('debug.elements.warningCount', { count: String(props.structuredPageData.observation.warnings.length) })}</span>
      <span>{streaming?.enabled ? t('debug.streaming.on') : t('debug.streaming.off')}</span>
      {showDebugBoundary ? (
        <span title={debugLimitations.join('; ') || t('debug.shallowBoundaryTitle')}>
          {t('debug.shallowBoundary')}
        </span>
      ) : null}
    </div>
  );
}

function TraceTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  const t = useT();
  return (
    <div className="bh-debugTab">
      <div className="bh-debugTabHeader">
        <ListTree size={16} />
        <strong>{t('debug.trace.title')}</strong>
        <span className="bh-debugTabActions">
          <DownloadTraceButton events={snapshot?.trace ?? []} />
        </span>
      </div>
      <TraceLog events={snapshot?.trace ?? []} />
    </div>
  );
}

function ToolTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  const t = useT();
  return (
    <div className="bh-debugTab">
      <div className="bh-debugTabHeader">
        <Wrench size={16} />
        <strong>{t('debug.tools.title')}</strong>
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
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<FilterChipKey>('all');
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>();
  const rows = useMemo(() => mergeElementsAndForms(data, locale), [data, locale]);
  const chips = filterChips(t);
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
          aria-label={t('debug.elements.searchAria')}
          placeholder={t('debug.elements.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <div className="bh-chipRow" aria-label={t('debug.elements.filterAria')}>
          {chips.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={chip === item.key}
              onClick={() => setChip(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bh-elementList" role="list" aria-label={t('debug.elements.resultAria')}>
        {filteredRows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="bh-elementListItem"
            aria-label={t('debug.elements.inspectAria', { label: row.label, refId: row.refId })}
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
  const t = useT();
  const stateText = t('debug.detail.visibleDisabled', {
    visible: String(row.visible),
    disabled: String(row.disabled)
  });
  const constraintsText = t('debug.detail.required', {
    required: String(row.required ?? false)
  });
  return (
    <article className="bh-detailPanel">
      <header>
        <h3>{t('debug.detail.title')}</h3>
        <code>{row.refId}</code>
      </header>
      <dl>
        <div><dt>{t('debug.detail.name')}</dt><dd>{row.label}</dd></div>
        <div><dt>{t('debug.detail.state')}</dt><dd>{stateText}</dd></div>
        <div><dt>{t('debug.detail.constraints')}</dt><dd>{constraintsText}</dd></div>
        <div><dt>{t('debug.detail.validation')}</dt><dd>{row.validationMessage ?? row.validation}</dd></div>
        <div><dt>{t('debug.detail.submitReason')}</dt><dd>{row.submitReason ?? t('debug.detail.noBlock')}</dd></div>
      </dl>
    </article>
  );
}

function StreamingTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  const t = useT();
  const streaming = snapshot?.streaming;
  const streamEvents = (snapshot?.trace ?? []).filter((event) =>
    event.type.startsWith('model_stream_')
  );
  const duration = streaming?.startedAt && streaming.finishedAt
    ? `${Math.max(0, streaming.finishedAt - streaming.startedAt)}ms`
    : streaming?.active
      ? t('debug.streaming.inProgress')
      : '-';
  return (
    <div className="bh-streamingTab">
      <div className="bh-debugTabHeader">
        <RadioTower size={16} />
        <strong>{t('debug.streaming.title')}</strong>
      </div>
      <dl className="bh-streamingMetrics">
        <div><dt>{t('debug.streaming.provider')}</dt><dd>{streaming?.provider ?? '-'}</dd></div>
        <div><dt>{t('debug.streaming.model')}</dt><dd>{streaming?.model ?? '-'}</dd></div>
        <div><dt>{t('debug.streaming.enabled')}</dt><dd>{String(streaming?.enabled ?? false)}</dd></div>
        <div><dt>{t('debug.streaming.active')}</dt><dd>{String(streaming?.active ?? false)}</dd></div>
        <div><dt>{t('debug.streaming.chunk')}</dt><dd>{streaming?.chunkCount ?? 0}</dd></div>
        <div><dt>{t('debug.streaming.duration')}</dt><dd>{duration}</dd></div>
        <div><dt>{t('debug.streaming.fallback')}</dt><dd>{String(streaming?.fallbackUsed ?? false)}</dd></div>
      </dl>
      {streaming?.fallbackReason ? <p>{streaming.fallbackReason}</p> : null}
      {streaming?.finalText ? (
        <article className="bh-streamPreview">
          <h3>{t('debug.streaming.finalPreview')}</h3>
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
  const t = useT();
  const handleDownload = () => {
    if (events.length === 0) return;
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
      aria-label={t('debug.trace.downloadAria')}
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
  chip: FilterChipKey
): boolean {
  const normalized = query.trim().toLowerCase();
  const chipMatched =
    chip === 'all' ||
    (chip === 'formField' && row.type === 'form-field') ||
    (chip === 'button' && row.type === 'button') ||
    (chip === 'error' && !!row.hasValidationIssue) ||
    (chip === 'disabled' && row.disabled);
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

function FormExecutionTab({ snapshot }: { snapshot?: RunSnapshot | undefined }) {
  const t = useT();
  if (!snapshot) {
    return <p className="bh-emptyMsg">{t('debug.noSnapshot')}</p>;
  }

  const toolResult = snapshot.toolResult;
  const events = snapshot.trace ?? [];
  const formTraceEvents = events.filter((e: RuntimeEvent) =>
    (e as { type?: string }).type?.startsWith('fill_') ||
    (e as { type?: string }).type?.startsWith('field_') ||
    (e as { type?: string }).type?.startsWith('form_') ||
    (e as { type?: string }).type?.startsWith('submit_')
  );

  return (
    <div className="bh-debugSection">
      <h3>{t('debug.form.title')}</h3>
      {toolResult ? (
        <div className="bh-debugDetail">
          <p><strong>{t('debug.form.tool')}:</strong> {toolResult.tool}</p>
          <p><strong>{t('debug.form.code')}:</strong> {toolResult.code}</p>
          <p><strong>{t('debug.form.summary')}:</strong> {toolResult.summary}</p>
          <p><strong>{t('debug.form.success')}:</strong> {toolResult.ok ? t('debug.form.yes') : t('debug.form.no')}</p>
        </div>
      ) : null}

      <h3>{t('debug.form.events', { count: String(formTraceEvents.length) })}</h3>
      {formTraceEvents.length === 0 ? (
        <p className="bh-emptyMsg">{t('debug.form.noEvents')}</p>
      ) : (
        <ul className="bh-eventList">
          {formTraceEvents.map((evt: RuntimeEvent, i: number) => (
            <li key={i} className="bh-eventItem">
              <span className="bh-eventType">{(evt as { type: string }).type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
