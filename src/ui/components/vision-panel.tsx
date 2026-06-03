import { Camera, Download, Eye } from 'lucide-react';

import type { ScreenshotCapture, VisionObservation } from '../../shared/schemas/vision';
import { useT } from '../../i18n/context';

type VisionScreenshotMeta = {
  mode?: ScreenshotCapture['mode'] | undefined;
  mimeType?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  bounds?: ScreenshotCapture['bounds'] | undefined;
  captureSource?: ScreenshotCapture['captureSource'] | undefined;
  fallbackReason?: string | undefined;
  truncated?: boolean | undefined;
  sensitivity?: ScreenshotCapture['sensitivity'] | undefined;
  dataUrl?: string | undefined;
};

type VisionPanelProps = {
  observation?: VisionObservation | undefined;
  screenshot?: VisionScreenshotMeta | undefined;
  busy?: boolean | undefined;
  message?: string | undefined;
  error?: string | undefined;
  onCaptureViewport?: (() => void) | undefined;
  onDetectOverlay?: (() => void) | undefined;
};

export function VisionPanel({
  observation,
  screenshot,
  busy = false,
  message,
  error,
  onCaptureViewport,
  onDetectOverlay
}: VisionPanelProps) {
  const t = useT();
  const fallback = observation?.fallback === 'dom_a11y';
  const summary = observation
    ? fallback ? t('vision.panel.fallback') : observation.summary
    : error ? t('vision.panel.screenshotFailure')
      : message ?? t('vision.panel.ready');
  return (
    <section className="bh-visionPanel" aria-label={t('vision.panel.aria')}>
      <header className="bh-visionPanelHeader">
        <div>
          <h3>{t('vision.panel.title')}</h3>
          <p>{busy ? t('vision.panel.capturing') : summary}</p>
        </div>
        <div className="bh-visionPanelActions" aria-label={t('vision.panel.actionsAria')}>
          <button
            type="button"
            className="bh-debugActionButton"
            aria-label={t('vision.panel.captureViewport')}
            title={t('vision.panel.captureViewport')}
            disabled={busy || !onCaptureViewport}
            onClick={onCaptureViewport}
          >
            <Camera size={14} />
          </button>
          <button
            type="button"
            className="bh-debugActionButton"
            aria-label={t('vision.panel.detectOverlay')}
            title={t('vision.panel.detectOverlay')}
            disabled={busy || !onDetectOverlay}
            onClick={onDetectOverlay}
          >
            <Eye size={14} />
          </button>
        </div>
        {observation?.confidence !== undefined ? (
          <span className="bh-visionConfidence">{Math.round(observation.confidence * 100)}%</span>
        ) : null}
      </header>
      {!observation && !screenshot?.dataUrl && !message && !error ? (
        <p className="bh-emptyState">{t('vision.panel.empty')}</p>
      ) : null}
      {error ? (
        <p className="bh-emptyState" role="status">
          <strong>{t('vision.panel.screenshotFailure')}</strong>: {error}
        </p>
      ) : null}
      {fallback ? (
        <p className="bh-emptyState">{observation?.fallbackReason ?? t('vision.panel.fallbackReason')}</p>
      ) : null}
      {screenshot?.dataUrl ? (
        <figure className="bh-visionShotPreview">
          <div className="bh-visionShotFrame">
            <img src={screenshot.dataUrl} alt={t('vision.panel.screenshotAlt')} />
            <a
              className="bh-visionShotDownload"
              href={screenshot.dataUrl}
              download={screenshotDownloadName(screenshot)}
              aria-label={t('vision.panel.downloadScreenshot')}
              title={t('vision.panel.downloadScreenshot')}
            >
              <Download size={14} />
            </a>
          </div>
          <figcaption>{t('vision.panel.previewNote')}</figcaption>
        </figure>
      ) : null}
      {screenshot ? (
        <div className="bh-visionShotMeta">
          <span>{screenshot.mode ?? 'viewport'}</span>
          {typeof screenshot.width === 'number' && typeof screenshot.height === 'number'
            ? <span>{t('vision.panel.dimensions', { width: String(screenshot.width), height: String(screenshot.height) })}</span>
            : null}
          {screenshot.mimeType ? <span>{screenshot.mimeType}</span> : null}
          {screenshot.captureSource ? <span>{screenshot.captureSource}</span> : null}
          {screenshot.truncated ? <span>{t('vision.panel.truncated')}</span> : null}
          {screenshot.fallbackReason ? <span>{screenshot.fallbackReason}</span> : null}
        </div>
      ) : null}
      <VisionList title={t('vision.panel.visibleText')} items={observation?.visibleText ?? []} />
      <VisionList title={t('vision.panel.blockers')} items={observation?.blockers ?? []} />
      <VisionList title={t('vision.panel.layoutIssues')} items={observation?.layoutIssues ?? []} />
      <VisionGroundingList observation={observation} />
      <VisionPointerFallback observation={observation} />
    </section>
  );
}

function screenshotDownloadName(screenshot: VisionScreenshotMeta): string {
  const mode = screenshot.mode ?? 'viewport';
  const extension = screenshot.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  return `browserhelm-${mode}-screenshot.${extension}`;
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

function VisionGroundingList({ observation }: { observation?: VisionObservation | undefined }) {
  const t = useT();
  const items = observation?.grounding ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="bh-visionList" aria-label={t('vision.panel.evidenceTitle')}>
      <h4>{t('vision.panel.evidenceTitle')}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.claim}:${index}`}>
            <strong>{sourceLabel(item.source, t)}</strong>
            {' '}
            <span>{confidenceLabel(item.confidence, t)}</span>
            {' - '}
            <span>{item.claim}</span>
            {item.reason ? <span> ({item.reason})</span> : null}
            {item.evidence.length ? (
              <ul>
                {item.evidence.map((evidence, evidenceIndex) => (
                  <li key={`${item.claim}:evidence:${evidenceIndex}`}>
                    {[evidence.kind, evidence.text, evidence.label, evidence.refId].filter(Boolean).join(' / ')}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VisionPointerFallback({ observation }: { observation?: VisionObservation | undefined }) {
  const t = useT();
  const fallback = observation?.pointerFallback;
  if (!fallback) {
    return null;
  }
  return (
    <section className="bh-visionList" aria-label={t('vision.panel.pointerFallback')}>
      <h4>{fallback.allowed ? t('vision.panel.pointerFallbackAllowed') : t('vision.panel.pointerFallbackDenied')}</h4>
      <p>
        {fallback.targetConfidence ? `${t('vision.panel.pointerConfidence')}: ${confidenceLabel(fallback.targetConfidence, t)}. ` : null}
        {fallback.domRefUnavailable ? t('vision.panel.domRefUnavailable') : t('vision.panel.domRefAvailable')}
        {fallback.reason ? ` ${fallback.reason}` : null}
      </p>
    </section>
  );
}

function sourceLabel(
  source: VisionObservation['grounding'][number]['source'],
  t: ReturnType<typeof useT>
): string {
  switch (source) {
    case 'dom_backed':
      return t('vision.panel.sourceDom');
    case 'a11y_backed':
      return t('vision.panel.sourceA11y');
    case 'visual_only':
      return t('vision.panel.sourceVisual');
    case 'unresolved':
      return t('vision.panel.sourceUnresolved');
  }
}

function confidenceLabel(
  confidence: VisionObservation['grounding'][number]['confidence'],
  t: ReturnType<typeof useT>
): string {
  switch (confidence) {
    case 'high':
      return t('vision.panel.confidenceHigh');
    case 'medium':
      return t('vision.panel.confidenceMedium');
    case 'low':
      return t('vision.panel.confidenceLow');
  }
}
