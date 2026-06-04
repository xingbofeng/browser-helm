import { Camera, Download, Eye, FileImage, Images } from 'lucide-react';

import type { ScreenshotCapture, VisionObservation } from '../../shared/schemas/vision';
import type {
  BatchFullPageScreenshotResult,
  BatchImageCollectionResult,
  PageImageItem
} from '../../shared/schemas/page-media';
import { useT } from '../../i18n/context';
import { createImageCollectionZip } from './vision-downloads';

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
  batchCapture?: BatchFullPageScreenshotResult | undefined;
  imageCollection?: BatchImageCollectionResult | undefined;
  onCaptureViewport?: (() => void) | undefined;
  onCaptureFullPages?: (() => void) | undefined;
  onCollectImages?: (() => void) | undefined;
  onDetectOverlay?: (() => void) | undefined;
};

export function VisionPanel({
  observation,
  screenshot,
  busy = false,
  message,
  error,
  batchCapture,
  imageCollection,
  onCaptureViewport,
  onCaptureFullPages,
  onCollectImages,
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
            aria-label={t('vision.panel.captureFullPages')}
            title={t('vision.panel.captureFullPages')}
            disabled={busy || !onCaptureFullPages}
            onClick={onCaptureFullPages}
          >
            <FileImage size={14} />
          </button>
          <button
            type="button"
            className="bh-debugActionButton"
            aria-label={t('vision.panel.collectImages')}
            title={t('vision.panel.collectImages')}
            disabled={busy || !onCollectImages}
            onClick={onCollectImages}
          >
            <Images size={14} />
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
      <VisionBatchScreenshots batchCapture={batchCapture} />
      <VisionImageCollection imageCollection={imageCollection} />
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

function VisionBatchScreenshots({
  batchCapture
}: {
  batchCapture?: BatchFullPageScreenshotResult | undefined;
}) {
  const t = useT();
  if (!batchCapture) {
    return null;
  }
  return (
    <section className="bh-visionBatchList">
      <div className="bh-visionBatchHeader">
        <h4>{t('vision.panel.batchScreenshotsTitle', {
          succeeded: String(batchCapture.succeededCount),
          total: String(batchCapture.requestedTabCount)
        })}</h4>
        <a
          className="bh-visionManifestDownload"
          href={jsonDataUrl(toBatchManifest(batchCapture))}
          download="browserhelm-full-page-screenshots.json"
          aria-label={t('vision.panel.downloadBatchManifest')}
          title={t('vision.panel.downloadBatchManifest')}
        >
          <Download size={14} />
        </a>
      </div>
      {batchCapture.failedCount > 0 ? (
        <p className="bh-emptyState">{t('vision.panel.batchFailed', { count: String(batchCapture.failedCount) })}</p>
      ) : null}
      <div className="bh-visionBatchPreview" aria-label={t('vision.panel.batchScreenshotsTitle', {
        succeeded: String(batchCapture.succeededCount),
        total: String(batchCapture.requestedTabCount)
      })}>
        {batchCapture.screenshots.map((item) => (
          <img
            key={`${item.tabId}:${item.screenshot.id}:preview`}
            src={item.screenshot.dataUrl}
            alt={item.tabTitle ?? item.pageUrl ?? `tab ${item.tabId}`}
          />
        ))}
      </div>
      <ul>
        {batchCapture.screenshots.map((item) => (
          <li key={`${item.tabId}:${item.screenshot.id}`}>
            <div>
              <strong>{item.tabTitle ?? item.pageUrl ?? `tab ${item.tabId}`}</strong>
              {item.pageUrl ? <span>{item.pageUrl}</span> : null}
              <span>{t('vision.panel.dimensions', {
                width: String(item.screenshot.width),
                height: String(item.screenshot.height)
              })}</span>
            </div>
            <a
              className="bh-visionInlineDownload"
              href={item.screenshot.dataUrl}
              download={`browserhelm-tab-${item.tabId}-full-page.png`}
              aria-label={t('vision.panel.downloadScreenshot')}
              title={t('vision.panel.downloadScreenshot')}
            >
              <Download size={14} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VisionImageCollection({
  imageCollection
}: {
  imageCollection?: BatchImageCollectionResult | undefined;
}) {
  const t = useT();
  if (!imageCollection) {
    return null;
  }
  return (
    <section className="bh-visionBatchList">
      <div className="bh-visionBatchHeader">
        <h4>{t('vision.panel.batchImagesTitle', { count: String(imageCollection.totalImageCount) })}</h4>
        {imageCollection.totalImageCount > 0 ? (
          <button
            type="button"
            className="bh-visionManifestDownload"
            aria-label={t('vision.panel.downloadImagesZip')}
            title={t('vision.panel.downloadImagesZip')}
            onClick={() => {
              void downloadImageCollectionZip(imageCollection);
            }}
          >
            <Download size={14} />
          </button>
        ) : null}
      </div>
      {imageCollection.failedCount > 0 ? (
        <p className="bh-emptyState">{t('vision.panel.batchFailed', { count: String(imageCollection.failedCount) })}</p>
      ) : null}
      {imageCollection.totalImageCount === 0 ? (
        <p className="bh-emptyState">{t('vision.panel.noImages')}</p>
      ) : null}
      <div className="bh-visionImagePages">
        {imageCollection.pages.map((page) => (
          <section key={page.tabId}>
            <h5>{page.tabTitle ?? page.pageUrl ?? `tab ${page.tabId}`}</h5>
            <p>{t('vision.panel.lazyScrollSteps', { steps: String(page.lazyLoad.steps) })}</p>
            <ul>
              {page.images.map((image) => (
                <li key={`${page.tabId}:${image.url}`}>
                  <ImageUrl image={image} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function ImageUrl({ image }: { image: PageImageItem }) {
  const text = [image.source, image.alt, image.url].filter(Boolean).join(' / ');
  if (image.url.startsWith('http://') || image.url.startsWith('https://')) {
    return (
      <a href={image.url} target="_blank" rel="noreferrer">
        {text}
      </a>
    );
  }
  return <span>{text}</span>;
}

function toBatchManifest(batchCapture: BatchFullPageScreenshotResult) {
  return {
    ...batchCapture,
    screenshots: batchCapture.screenshots.map((item) => ({
      ...item,
      screenshot: {
        ...item.screenshot,
        dataUrl: '[MASKED_IMAGE_DATA]'
      }
    }))
  };
}

function jsonDataUrl(value: unknown): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(value, null, 2))}`;
}

async function downloadImageCollectionZip(imageCollection: BatchImageCollectionResult): Promise<void> {
  const zip = await createImageCollectionZip(imageCollection);
  const url = URL.createObjectURL(zip);
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'browserhelm-page-images.zip';
  anchor.click();
  setTimeout(() => revokeObjectUrl(url), 0);
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
