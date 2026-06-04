import { defaultDebuggerManager } from './debugger/debugger-manager';
import { defaultScreenshotManager, type CaptureViewportInput, type ScreenshotManager } from './screenshot-manager';
import {
  batchFullPageScreenshotResultSchema,
  batchImageCollectionResultSchema,
  lazyLoadScrollReportSchema,
  pageImageItemSchema,
  type BatchFullPageScreenshotResult,
  type BatchImageCollectionResult,
  type BatchMediaFailure,
  type BatchMediaScope,
  type LazyLoadScrollReport,
  type PageImageItem
} from '../shared/schemas/page-media';

type ScreenshotManagerLike = Pick<ScreenshotManager, 'captureFullPage'>;

type PageMediaManagerDeps = {
  screenshotManager?: ScreenshotManagerLike | undefined;
};

type BatchInput = {
  sourceTabId: number;
  scope?: BatchMediaScope | undefined;
  maxTabs?: number | undefined;
};

type BatchCaptureInput = BatchInput;

type BatchCollectImagesInput = BatchInput & {
  maxImagesPerTab?: number | undefined;
  includeCssBackgrounds?: boolean | undefined;
};

type BatchTargetTab = {
  id: number;
  windowId?: number | undefined;
  url?: string | undefined;
  title?: string | undefined;
};

type CollectImagesScriptResult = {
  lazyLoad: LazyLoadScrollReport;
  images: PageImageItem[];
};

const DEFAULT_MAX_TABS = 8;
const DEFAULT_MAX_IMAGES_PER_TAB = 250;

export class PageMediaManager {
  private readonly screenshotManager: ScreenshotManagerLike;

  constructor(deps: PageMediaManagerDeps = {}) {
    this.screenshotManager = deps.screenshotManager ?? defaultScreenshotManager;
  }

  async captureFullPageBatch(input: BatchCaptureInput): Promise<BatchFullPageScreenshotResult> {
    const scope = input.scope ?? 'current_window';
    const tabs = await resolveBatchTabs({
      sourceTabId: input.sourceTabId,
      scope,
      maxTabs: input.maxTabs
    });
    const screenshots: BatchFullPageScreenshotResult['screenshots'] = [];
    const failures: BatchMediaFailure[] = [];

    for (const tab of tabs) {
      try {
        const captureInput: CaptureViewportInput = {
          tabId: tab.id,
          ...(tab.windowId === undefined ? {} : { windowId: tab.windowId })
        };
        screenshots.push({
          tabId: tab.id,
          ...(tab.windowId === undefined ? {} : { windowId: tab.windowId }),
          ...(tab.url ? { pageUrl: sanitizePageUrl(tab.url) } : {}),
          ...(tab.title ? { tabTitle: tab.title } : {}),
          screenshot: await this.screenshotManager.captureFullPage(captureInput)
        });
      } catch (error) {
        failures.push(batchFailure(tab, error));
      }
    }

    return batchFullPageScreenshotResultSchema.parse({
      scope,
      requestedTabCount: tabs.length,
      succeededCount: screenshots.length,
      failedCount: failures.length,
      screenshots,
      failures
    });
  }

  async collectImagesBatch(input: BatchCollectImagesInput): Promise<BatchImageCollectionResult> {
    const scope = input.scope ?? 'current_window';
    const maxImages = clampInteger(input.maxImagesPerTab, 1, 1000, DEFAULT_MAX_IMAGES_PER_TAB);
    const tabs = await resolveBatchTabs({
      sourceTabId: input.sourceTabId,
      scope,
      maxTabs: input.maxTabs
    });
    const pages: BatchImageCollectionResult['pages'] = [];
    const failures: BatchMediaFailure[] = [];

    for (const tab of tabs) {
      try {
        const collected = await collectImagesFromTab(tab.id, {
          maxImages,
          includeCssBackgrounds: input.includeCssBackgrounds !== false
        });
        const images = dedupeImages(collected.images, maxImages);
        pages.push({
          tabId: tab.id,
          ...(tab.windowId === undefined ? {} : { windowId: tab.windowId }),
          ...(tab.url ? { pageUrl: sanitizePageUrl(tab.url) } : {}),
          ...(tab.title ? { tabTitle: tab.title } : {}),
          imageCount: images.length,
          lazyLoad: collected.lazyLoad,
          images
        });
      } catch (error) {
        failures.push(batchFailure(tab, error));
      }
    }

    const totalImageCount = pages.reduce((total, page) => total + page.imageCount, 0);
    return batchImageCollectionResultSchema.parse({
      scope,
      requestedTabCount: tabs.length,
      succeededCount: pages.length,
      failedCount: failures.length,
      totalImageCount,
      pages,
      failures
    });
  }
}

export const defaultPageMediaManager = new PageMediaManager();

async function resolveBatchTabs(input: Required<Pick<BatchInput, 'sourceTabId' | 'scope'>> & {
  maxTabs?: number | undefined;
}): Promise<BatchTargetTab[]> {
  const maxTabs = clampInteger(input.maxTabs, 1, 20, DEFAULT_MAX_TABS);
  if (input.scope === 'active_tab') {
    const get = globalThis.chrome?.tabs?.get;
    if (typeof get === 'function') {
      try {
        const [tab] = toBatchTargetTab(await get(input.sourceTabId));
        if (tab) {
          return [tab];
        }
      } catch {
        return [{ id: input.sourceTabId }];
      }
    }
    return [{ id: input.sourceTabId }];
  }
  const query = globalThis.chrome?.tabs?.query;
  if (typeof query !== 'function') {
    return [{ id: input.sourceTabId }];
  }
  const tabs = await query({ currentWindow: true });
  const eligible = tabs
    .flatMap((tab) => toBatchTargetTab(tab))
    .filter((tab) => isHttpLikeUrl(tab.url))
    .slice(0, maxTabs);
  if (eligible.length > 0) {
    return eligible;
  }
  return [{ id: input.sourceTabId }];
}

function toBatchTargetTab(tab: chrome.tabs.Tab): BatchTargetTab[] {
  if (typeof tab.id !== 'number') {
    return [];
  }
  if (tab.discarded === true) {
    return [];
  }
  return [{
    id: tab.id,
    ...(typeof tab.windowId === 'number' ? { windowId: tab.windowId } : {}),
    ...(typeof tab.url === 'string' ? { url: tab.url } : {}),
    ...(typeof tab.title === 'string' && tab.title.length > 0 ? { title: tab.title } : {})
  }];
}

async function collectImagesFromTab(
  tabId: number,
  options: { maxImages: number; includeCssBackgrounds: boolean }
): Promise<CollectImagesScriptResult> {
  const executeScript = globalThis.chrome?.scripting && 'executeScript' in globalThis.chrome.scripting
    ? globalThis.chrome.scripting.executeScript
    : undefined;
  const scriptOptions = {
    maxImages: options.maxImages,
    includeCssBackgrounds: options.includeCssBackgrounds,
    maxScrolls: 24,
    scrollStepPx: 0,
    settleMs: 180
  };
  if (typeof executeScript === 'function') {
    try {
      const [result] = await executeScript({
        target: { tabId },
        args: [scriptOptions],
        func: collectImagesAfterLazyLoadScript
      });
      return parseCollectImagesResult(result?.result);
    } catch {
      // Fall through to CDP Runtime.evaluate below.
    }
  }

  const result = await defaultDebuggerManager.evaluate(
    tabId,
    `(${collectImagesAfterLazyLoadScript.toString()})(${JSON.stringify(scriptOptions)})`,
    { awaitPromise: true }
  );
  const remoteObject = result.result;
  const value = typeof remoteObject === 'object' && remoteObject !== null
    ? (remoteObject as Record<string, unknown>).value
    : undefined;
  return parseCollectImagesResult(value);
}

function parseCollectImagesResult(value: unknown): CollectImagesScriptResult {
  if (!isRecord(value)) {
    throw new Error('image_collection_result_unavailable');
  }
  const lazyLoad = lazyLoadScrollReportSchema.parse(value.lazyLoad);
  const rawImages = Array.isArray(value.images) ? value.images : [];
  const images = rawImages.flatMap((item) => {
    const parsed = pageImageItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { lazyLoad, images };
}

function dedupeImages(images: PageImageItem[], maxImages: number): PageImageItem[] {
  const seen = new Set<string>();
  const result: PageImageItem[] = [];
  for (const image of images) {
    if (seen.has(image.url)) {
      continue;
    }
    seen.add(image.url);
    result.push(image);
    if (result.length >= maxImages) {
      break;
    }
  }
  return result;
}

function batchFailure(tab: BatchTargetTab, error: unknown): BatchMediaFailure {
  return {
    ...(tab.id ? { tabId: tab.id } : {}),
    ...(tab.url ? { pageUrl: sanitizePageUrl(tab.url) } : {}),
    ...(tab.title ? { tabTitle: tab.title } : {}),
    reason: error instanceof Error ? error.message : 'page_media_batch_item_failed'
  };
}

function sanitizePageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('#')[0]?.split('?')[0] ?? url;
  }
}

function isHttpLikeUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//iu.test(url);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function collectImagesAfterLazyLoadScript(options: {
  maxImages: number;
  includeCssBackgrounds: boolean;
  maxScrolls: number;
  scrollStepPx: number;
  settleMs: number;
}): Promise<CollectImagesScriptResult> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const lazyLoad = await lazyScroll();
  const images: PageImageItem[] = [];
  const seen = new Set<string>();

  addDocumentImageElements();
  addPictureSources();
  addDocumentImageMetadata();
  if (options.includeCssBackgrounds) {
    addCssBackgroundImages();
  }

  return { lazyLoad, images };

  async function lazyScroll(): Promise<LazyLoadScrollReport> {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const initialScrollHeight = Math.max(
      scrollingElement.scrollHeight,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    );
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const stepPx = options.scrollStepPx > 0
      ? options.scrollStepPx
      : Math.max(240, Math.floor(viewportHeight * 0.85));
    let steps = 0;
    let previousScrollHeight = initialScrollHeight;
    let stableBottomPasses = 0;
    try {
      for (let index = 0; index < options.maxScrolls; index += 1) {
        const scrollHeight = Math.max(
          scrollingElement.scrollHeight,
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0
        );
        const maxY = Math.max(0, scrollHeight - viewportHeight);
        const nextY = Math.min(maxY, Math.max(window.scrollY + stepPx, index === 0 ? stepPx : window.scrollY));
        window.scrollTo(0, nextY);
        steps += 1;
        if (options.settleMs > 0) {
          await wait(options.settleMs);
        }
        const nextScrollHeight = Math.max(
          scrollingElement.scrollHeight,
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0
        );
        const atBottom = Math.abs(window.scrollY - Math.max(0, nextScrollHeight - viewportHeight)) <= 4;
        stableBottomPasses = atBottom && Math.abs(nextScrollHeight - previousScrollHeight) <= 1
          ? stableBottomPasses + 1
          : 0;
        previousScrollHeight = nextScrollHeight;
        if (stableBottomPasses >= 2) {
          break;
        }
      }
    } finally {
      window.scrollTo(originalX, originalY);
      if (options.settleMs > 0) {
        await wait(Math.min(80, options.settleMs));
      }
    }
    return {
      attempted: true,
      steps,
      initialScrollHeight,
      finalScrollHeight: Math.max(
        scrollingElement.scrollHeight,
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      ),
      restoredScrollX: originalX,
      restoredScrollY: originalY
    };
  }

  function addDocumentImageElements() {
    for (const image of Array.from(document.images)) {
      const rawUrl = image.currentSrc || image.src || image.getAttribute('data-src') || firstSrcsetCandidate(image.getAttribute('srcset'));
      addImage(rawUrl, 'img', {
        alt: image.alt,
        title: image.title,
        selector: selectorFor(image),
        width: image.width,
        height: image.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        loading: image.loading,
        visible: isVisible(image)
      });
      for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-url']) {
        addImage(image.getAttribute(attr), 'img', {
          alt: image.alt,
          title: image.title,
          selector: selectorFor(image),
          width: image.width,
          height: image.height,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          loading: image.loading,
          visible: isVisible(image)
        });
      }
      addImage(firstSrcsetCandidate(image.getAttribute('data-srcset')), 'img', {
        alt: image.alt,
        title: image.title,
        selector: selectorFor(image),
        visible: isVisible(image)
      });
    }
  }

  function addPictureSources() {
    for (const source of Array.from(document.querySelectorAll('source[srcset], source[data-srcset]'))) {
      addImage(firstSrcsetCandidate(source.getAttribute('srcset') || source.getAttribute('data-srcset')), 'source', {
        selector: selectorFor(source),
        visible: isVisible(source)
      });
    }
  }

  function addDocumentImageMetadata() {
    for (const link of Array.from(document.querySelectorAll('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]'))) {
      addImage(link.getAttribute('href'), 'link_icon', {
        title: link.getAttribute('rel') ?? undefined,
        selector: selectorFor(link),
        visible: false
      });
    }
    for (const meta of Array.from(document.querySelectorAll('meta[property="og:image"][content], meta[name="twitter:image"][content]'))) {
      addImage(meta.getAttribute('content'), 'open_graph', {
        title: meta.getAttribute('property') ?? meta.getAttribute('name') ?? undefined,
        selector: selectorFor(meta),
        visible: false
      });
    }
  }

  function addCssBackgroundImages() {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (images.length >= options.maxImages) {
        return;
      }
      const background = getComputedStyle(element).backgroundImage;
      if (!background || background === 'none') {
        continue;
      }
      const matches = background.matchAll(/url\((['"]?)(.*?)\1\)/giu);
      for (const match of matches) {
        addImage(match[2], 'css_background', {
          selector: selectorFor(element),
          width: Math.max(0, Math.round(element.getBoundingClientRect().width)),
          height: Math.max(0, Math.round(element.getBoundingClientRect().height)),
          visible: isVisible(element)
        });
      }
    }
  }

  function addImage(
    rawUrl: string | null | undefined,
    source: PageImageItem['source'],
    meta: Omit<PageImageItem, 'url' | 'rawUrl' | 'source'>
  ) {
    if (images.length >= options.maxImages) {
      return;
    }
    const url = normalizeImageUrl(rawUrl);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    images.push({
      url,
      ...(rawUrl && !rawUrl.startsWith('data:image/') ? { rawUrl } : {}),
      source,
      ...compactImageMeta(meta)
    });
  }

  function compactImageMeta(meta: Omit<PageImageItem, 'url' | 'rawUrl' | 'source'>) {
    const compacted: Omit<PageImageItem, 'url' | 'rawUrl' | 'source'> = {};
    if (meta.alt) compacted.alt = meta.alt;
    if (meta.title) compacted.title = meta.title;
    if (meta.selector) compacted.selector = meta.selector;
    if (typeof meta.width === 'number' && Number.isFinite(meta.width)) compacted.width = Math.max(0, Math.round(meta.width));
    if (typeof meta.height === 'number' && Number.isFinite(meta.height)) compacted.height = Math.max(0, Math.round(meta.height));
    if (typeof meta.naturalWidth === 'number' && Number.isFinite(meta.naturalWidth)) compacted.naturalWidth = Math.max(0, Math.round(meta.naturalWidth));
    if (typeof meta.naturalHeight === 'number' && Number.isFinite(meta.naturalHeight)) compacted.naturalHeight = Math.max(0, Math.round(meta.naturalHeight));
    if (meta.loading) compacted.loading = meta.loading;
    if (typeof meta.visible === 'boolean') compacted.visible = meta.visible;
    return compacted;
  }

  function normalizeImageUrl(rawUrl: string | null | undefined): string | undefined {
    const value = rawUrl?.trim();
    if (!value || value === 'none' || value.startsWith('blob:')) {
      return undefined;
    }
    if (value.startsWith('data:image/')) {
      const mime = /^data:([^;,]+)/iu.exec(value)?.[1] ?? 'image';
      return `inline:${mime}`;
    }
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return undefined;
    }
  }

  function firstSrcsetCandidate(srcset: string | null | undefined): string | undefined {
    return srcset?.split(',').map((part) => part.trim().split(/\s+/u)[0]).find(Boolean);
  }

  function isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') > 0;
  }

  function selectorFor(element: Element): string {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) {
      return tag;
    }
    const index = Array.from(parent.children).indexOf(element) + 1;
    return `${tag}:nth-child(${index})`;
  }
}
