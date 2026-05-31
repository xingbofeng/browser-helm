import type { ScreenshotCapture, VisionObservation } from '../../shared/schemas/vision';
import { useT } from '../../i18n/context';

type VisionScreenshotMeta = {
  mode?: ScreenshotCapture['mode'] | undefined;
  mimeType?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  bounds?: ScreenshotCapture['bounds'] | undefined;
};

type VisionPanelProps = {
  observation?: VisionObservation | undefined;
  screenshot?: VisionScreenshotMeta | undefined;
};

export function VisionPanel({ observation, screenshot }: VisionPanelProps) {
  const t = useT();
  if (!observation) {
    return (
      <section className="bh-visionPanel" aria-label={t('vision.panel.aria')}>
        <h3>{t('vision.panel.title')}</h3>
        <p className="bh-emptyState">{t('vision.panel.empty')}</p>
      </section>
    );
  }
  const fallback = observation.fallback === 'dom_a11y';
  return (
    <section className="bh-visionPanel" aria-label={t('vision.panel.aria')}>
      <header className="bh-visionPanelHeader">
        <div>
          <h3>{t('vision.panel.title')}</h3>
          <p>{fallback ? t('vision.panel.fallback') : observation.summary}</p>
        </div>
        {observation.confidence !== undefined ? (
          <span className="bh-visionConfidence">{Math.round(observation.confidence * 100)}%</span>
        ) : null}
      </header>
      {fallback ? (
        <p className="bh-emptyState">{observation.fallbackReason ?? t('vision.panel.fallbackReason')}</p>
      ) : null}
      {screenshot ? (
        <div className="bh-visionShotMeta">
          <span>{screenshot.mode ?? 'viewport'}</span>
          {typeof screenshot.width === 'number' && typeof screenshot.height === 'number'
            ? <span>{t('vision.panel.dimensions', { width: String(screenshot.width), height: String(screenshot.height) })}</span>
            : null}
          {screenshot.mimeType ? <span>{screenshot.mimeType}</span> : null}
        </div>
      ) : null}
      <VisionList title={t('vision.panel.visibleText')} items={observation.visibleText ?? []} />
      <VisionList title={t('vision.panel.blockers')} items={observation.blockers ?? []} />
      <VisionList title={t('vision.panel.layoutIssues')} items={observation.layoutIssues ?? []} />
    </section>
  );
}

function VisionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="bh-visionList">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
