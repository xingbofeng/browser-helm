import type { CdpPerformanceSnapshot } from '../../shared/schemas/cdp-event';
import { useT } from '../../i18n/context';

type PerformancePanelProps = {
  snapshot?: CdpPerformanceSnapshot | undefined;
};

const IMPORTANT_METRICS = new Set([
  'Timestamp',
  'Documents',
  'Frames',
  'Nodes',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
  'LayoutCount',
  'RecalcStyleCount',
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration'
]);

export function PerformancePanel({ snapshot }: PerformancePanelProps) {
  const t = useT();
  const metrics = (snapshot?.metrics ?? []).filter((metric) => IMPORTANT_METRICS.has(metric.name));
  return (
    <section className="bh-cdpPanel" aria-label={t('debug.cdp.performance.aria')}>
      <header className="bh-cdpPanelHeader">
        <div>
          <h3>{t('debug.cdp.performance.title')}</h3>
          <p>{snapshot ? t('debug.cdp.performance.collected', { count: String(snapshot.metrics.length) }) : t('debug.cdp.performance.prompt')}</p>
        </div>
      </header>
      {metrics.length ? (
        <div className="bh-performanceGrid">
          {metrics.map((metric) => (
            <div key={metric.name} className="bh-performanceMetric">
              <span>{metric.name}</span>
              <strong>{formatMetric(metric.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="bh-emptyState">{t('debug.cdp.performance.empty')}</p>
      )}
    </section>
  );
}

function formatMetric(value: number): string {
  if (value > 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}m`;
  }
  if (value > 1_000) {
    return `${(value / 1_000).toFixed(2)}k`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
