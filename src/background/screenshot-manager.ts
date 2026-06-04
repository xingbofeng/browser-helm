import {
  screenshotCaptureSchema,
  type ScreenshotBounds,
  type ScreenshotCapture
} from '../shared/schemas/vision';
import { defaultDebuggerManager } from './debugger/debugger-manager';
import { warmPageForLazyMedia } from './page-lazy-loader';

export type CaptureViewportInput = {
  tabId: number;
  windowId?: number | undefined;
};

export type CaptureElementInput = CaptureViewportInput & {
  selector: string;
};

type ScreenshotDimensions = {
  width: number;
  height: number;
};

type CapturedImage = {
  dataUrl: string;
  captureSource: ScreenshotCapture['captureSource'];
  fallbackReason?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
};

type ScrollCaptureMetrics = {
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  devicePixelRatio: number;
};

type ScrollCaptureTile = {
  image: ImageBitmap;
  scrollY: number;
  captureSource: ScreenshotCapture['captureSource'];
};

const MAX_SCROLL_STITCH_TILES = 80;
const SCROLL_STITCH_SETTLE_MS = 40;

export class ScreenshotManager {
  async captureViewport(input: CaptureViewportInput): Promise<ScreenshotCapture> {
    const captured = await captureVisible(input);
    const dimensions = dimensionsFromCapture(captured) ?? await readViewportDimensions(input.tabId);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_viewport`,
      tabId: input.tabId,
      mode: 'viewport',
      mimeType: mimeTypeFromDataUrl(captured.dataUrl),
      dataUrl: captured.dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      captureSource: captured.captureSource,
      ...(captured.fallbackReason ? { fallbackReason: captured.fallbackReason } : {}),
      truncated: false,
      sensitivity: 'unknown',
      capturedAt: Date.now(),
      traceSafe: false
    });
  }

  async captureFullPage(input: CaptureViewportInput): Promise<ScreenshotCapture> {
    const captured = await captureFullPage(input);
    const dimensions = dimensionsFromCapture(captured) ?? await readViewportDimensions(input.tabId);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_full_page`,
      tabId: input.tabId,
      mode: 'full_page',
      mimeType: mimeTypeFromDataUrl(captured.dataUrl),
      dataUrl: captured.dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      captureSource: captured.captureSource,
      ...(captured.fallbackReason ? { fallbackReason: captured.fallbackReason } : {}),
      truncated: captured.fallbackReason !== undefined,
      sensitivity: 'unknown',
      capturedAt: Date.now(),
      traceSafe: false
    });
  }

  async captureElement(input: CaptureElementInput): Promise<ScreenshotCapture> {
    const bounds = await readElementBounds(input.tabId, input.selector);
    const captured = await captureVisible(input);
    const cropped = await cropElementCapture(captured.dataUrl, bounds);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_element`,
      tabId: input.tabId,
      mode: 'element',
      mimeType: mimeTypeFromDataUrl(cropped.dataUrl),
      dataUrl: cropped.dataUrl,
      selector: input.selector,
      bounds,
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      captureSource: captured.captureSource,
      cropStatus: cropped.status,
      ...(cropped.fallbackReason ?? captured.fallbackReason
        ? { fallbackReason: cropped.fallbackReason ?? captured.fallbackReason }
        : {}),
      truncated: cropped.status === 'unavailable',
      sensitivity: 'unknown',
      capturedAt: Date.now(),
      traceSafe: false
    });
  }
}

export const defaultScreenshotManager = new ScreenshotManager();

type ElementCropResult = {
  dataUrl: string;
  status: 'cropped' | 'unavailable';
  fallbackReason?: string | undefined;
};

async function cropElementCapture(
  dataUrl: string,
  bounds: ScreenshotBounds
): Promise<ElementCropResult> {
  if (
    typeof globalThis.fetch !== 'function' ||
    typeof globalThis.createImageBitmap !== 'function' ||
    typeof globalThis.OffscreenCanvas !== 'function'
  ) {
    return {
      dataUrl,
      status: 'unavailable',
      fallbackReason: 'element_crop_unavailable_viewport_with_bounds_fallback'
    };
  }

  try {
    const response = await fetch(dataUrl);
    const image = await createImageBitmap(await response.blob());
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2d canvas context unavailable');
    }
    context.drawImage(
      image,
      Math.max(0, Math.round(bounds.x)),
      Math.max(0, Math.round(bounds.y)),
      width,
      height,
      0,
      0,
      width,
      height
    );
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return {
      dataUrl: await blobToDataUrl(blob),
      status: 'cropped'
    };
  } catch {
    return {
      dataUrl,
      status: 'unavailable',
      fallbackReason: 'element_crop_unavailable_viewport_with_bounds_fallback'
    };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'function') {
    return blob.arrayBuffer().then((buffer) =>
      `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(new Uint8Array(buffer))}`
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to convert screenshot blob to data URL'));
    };
    reader.onerror = () => reject(new Error('Unable to convert screenshot blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function captureVisible(input: CaptureViewportInput): Promise<CapturedImage> {
  if (!globalThis.chrome?.tabs?.captureVisibleTab) {
    return captureWithDebugger(input.tabId);
  }
  try {
    await activateTabForVisibleCapture(input);
    const dataUrl = input.windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(input.windowId, { format: 'png' });
    return {
      dataUrl,
      captureSource: 'tabs_capture_visible_tab'
    };
  } catch (error) {
    if (canFallbackToDebugger(error)) {
      return captureWithDebugger(input.tabId, 'tabs_capture_visible_tab_unavailable');
    }
    throw error;
  }
}

async function captureWithDebugger(
  tabId: number,
  fallbackReason?: string
): Promise<CapturedImage> {
  return {
    ...await defaultDebuggerManager.captureScreenshot(tabId),
    captureSource: 'cdp_capture_screenshot',
    ...(fallbackReason ? { fallbackReason } : {})
  };
}

async function captureFullPage(input: CaptureViewportInput): Promise<CapturedImage> {
  await warmPageForLazyMedia(input.tabId);
  const stitched = await captureFullPageByScrolling(input);
  if (stitched) {
    return stitched;
  }
  if (!globalThis.chrome?.tabs?.captureVisibleTab) {
    throw new Error('chrome.tabs.captureVisibleTab is unavailable for full-page screenshots');
  }
  try {
    await activateTabForVisibleCapture(input);
    const dataUrl = input.windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(input.windowId, { format: 'png' });
    return {
      dataUrl,
      captureSource: 'tabs_capture_visible_tab',
      fallbackReason: 'cdp_full_page_unavailable_viewport_fallback'
    };
  } catch (error) {
    if (!canFallbackToDebugger(error)) {
      throw error;
    }
    return {
      ...await defaultDebuggerManager.captureScreenshot(input.tabId, { fullPage: true }),
      captureSource: 'cdp_capture_screenshot',
      fallbackReason: 'cdp_full_page_unavailable_viewport_fallback'
    };
  }
}

async function activateTabForVisibleCapture(input: CaptureViewportInput): Promise<void> {
  try {
    if (typeof input.windowId === 'number' && typeof globalThis.chrome?.windows?.update === 'function') {
      await chrome.windows.update(input.windowId, { focused: true });
    }
    if (typeof globalThis.chrome?.tabs?.update === 'function') {
      await chrome.tabs.update(input.tabId, { active: true });
    }
  } catch {
    // Best effort only: debugger fallback can still handle non-active targets.
  }
}

async function captureFullPageByScrolling(input: CaptureViewportInput): Promise<CapturedImage | undefined> {
  const executeScript = globalThis.chrome?.scripting && 'executeScript' in globalThis.chrome.scripting
    ? globalThis.chrome.scripting.executeScript
    : undefined;
  if (
    typeof globalThis.chrome?.tabs?.captureVisibleTab !== 'function' ||
    typeof executeScript !== 'function' ||
    typeof globalThis.fetch !== 'function' ||
    typeof globalThis.createImageBitmap !== 'function' ||
    typeof globalThis.OffscreenCanvas !== 'function'
  ) {
    return undefined;
  }

  let initialMetrics: ScrollCaptureMetrics | undefined;
  try {
    initialMetrics = await runScrollCaptureScript(input.tabId, 'metrics');
    const allPositions = fullPageScrollPositions(initialMetrics);
    const positions = allPositions.slice(0, MAX_SCROLL_STITCH_TILES);
    const tiles: ScrollCaptureTile[] = [];
    for (const position of positions) {
      const metrics = await runScrollCaptureScript(input.tabId, 'scroll', 0, position);
      const captured = await captureVisible(input);
      const image = await imageBitmapFromDataUrl(captured.dataUrl);
      tiles.push({
        image,
        scrollY: metrics.scrollY,
        captureSource: captured.captureSource
      });
    }
    if (tiles.length === 0) {
      return undefined;
    }
    const truncated = positions.length < allPositions.length;
    return await stitchScrollCaptureTiles({
      metrics: initialMetrics,
      tiles,
      truncated
    });
  } catch {
    return undefined;
  } finally {
    if (initialMetrics) {
      await runScrollCaptureScript(
        input.tabId,
        'restore',
        initialMetrics.scrollX,
        initialMetrics.scrollY
      ).catch(() => undefined);
    }
  }
}

async function stitchScrollCaptureTiles(input: {
  metrics: ScrollCaptureMetrics;
  tiles: ScrollCaptureTile[];
  truncated: boolean;
}): Promise<CapturedImage> {
  const firstTile = input.tiles[0];
  if (!firstTile) {
    throw new Error('scroll_stitch_tiles_unavailable');
  }
  const scale = Math.max(0.1, input.metrics.devicePixelRatio);
  const canvasWidth = Math.max(1, Math.round(input.metrics.documentWidth * scale));
  const lastTile = input.tiles[input.tiles.length - 1] ?? firstTile;
  const stitchedDocumentHeight = input.truncated
    ? Math.min(input.metrics.documentHeight, lastTile.scrollY + input.metrics.viewportHeight)
    : input.metrics.documentHeight;
  const canvasHeight = Math.max(1, Math.round(stitchedDocumentHeight * scale));
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d canvas context unavailable');
  }
  for (const tile of input.tiles) {
    const destY = Math.max(0, Math.round(tile.scrollY * scale));
    const remainingHeight = canvasHeight - destY;
    if (remainingHeight <= 0) {
      continue;
    }
    const sourceHeight = Math.min(tile.image.height, remainingHeight);
    context.drawImage(
      tile.image,
      0,
      0,
      Math.min(tile.image.width, canvasWidth),
      sourceHeight,
      0,
      destY,
      Math.min(tile.image.width, canvasWidth),
      sourceHeight
    );
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return {
    dataUrl: await blobToDataUrl(blob),
    captureSource: firstTile.captureSource,
    width: canvasWidth,
    height: canvasHeight,
    ...(input.truncated ? { fallbackReason: 'full_page_scroll_stitch_truncated_after_tile_limit' } : {})
  };
}

async function imageBitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  return createImageBitmap(await response.blob());
}

function fullPageScrollPositions(metrics: ScrollCaptureMetrics): number[] {
  const viewportHeight = Math.max(1, Math.round(metrics.viewportHeight));
  const maxScrollY = Math.max(0, Math.round(metrics.documentHeight - metrics.viewportHeight));
  const positions = [0];
  for (let position = viewportHeight; position < maxScrollY; position += viewportHeight) {
    positions.push(position);
  }
  const lastPosition = positions[positions.length - 1] ?? 0;
  if (maxScrollY > 0 && lastPosition !== maxScrollY) {
    positions.push(maxScrollY);
  }
  return positions;
}

async function runScrollCaptureScript(
  tabId: number,
  operation: 'metrics' | 'scroll' | 'restore',
  x = 0,
  y = 0
): Promise<ScrollCaptureMetrics> {
  const executeScript = globalThis.chrome?.scripting && 'executeScript' in globalThis.chrome.scripting
    ? globalThis.chrome.scripting.executeScript
    : undefined;
  if (typeof executeScript !== 'function') {
    throw new Error('chrome.scripting.executeScript unavailable');
  }
  const args: ['metrics' | 'scroll' | 'restore', number, number, number] = [
    operation,
    x,
    y,
    SCROLL_STITCH_SETTLE_MS
  ];
  const [result] = await executeScript({
    target: { tabId },
    args,
    func: scrollCaptureScript
  });
  return parseScrollCaptureMetrics(result?.result);
}

async function scrollCaptureScript(
  operation: 'metrics' | 'scroll' | 'restore',
  x: number,
  y: number,
  settleMs: number
): Promise<ScrollCaptureMetrics> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  if (operation === 'scroll' || operation === 'restore') {
    window.scrollTo(x, y);
    if (settleMs > 0) {
      await wait(settleMs);
    }
  }
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const viewportWidth = Math.max(1, window.visualViewport?.width ?? window.innerWidth ?? document.documentElement.clientWidth ?? 1);
  const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? 1);
  const documentWidth = Math.max(
    viewportWidth,
    scrollingElement.scrollWidth,
    document.documentElement.scrollWidth,
    document.body?.scrollWidth ?? 0
  );
  const documentHeight = Math.max(
    viewportHeight,
    scrollingElement.scrollHeight,
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth,
    viewportHeight,
    documentWidth,
    documentHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function parseScrollCaptureMetrics(value: unknown): ScrollCaptureMetrics {
  if (!isRecord(value)) {
    throw new Error('scroll_capture_metrics_unavailable');
  }
  return {
    scrollX: finiteNumber(value.scrollX),
    scrollY: finiteNumber(value.scrollY),
    viewportWidth: positiveNumber(value.viewportWidth),
    viewportHeight: positiveNumber(value.viewportHeight),
    documentWidth: positiveNumber(value.documentWidth),
    documentHeight: positiveNumber(value.documentHeight),
    devicePixelRatio: positiveNumber(value.devicePixelRatio)
  };
}

async function readViewportDimensions(tabId: number): Promise<ScreenshotDimensions> {
  const executeScript = globalThis.chrome?.scripting && 'executeScript' in globalThis.chrome.scripting
    ? globalThis.chrome.scripting.executeScript
    : undefined;
  if (typeof executeScript === 'function') {
    try {
      const [result] = await executeScript({
        target: { tabId },
        func: () => ({
          width: Math.max(1, Math.round((window.visualViewport?.width ?? window.innerWidth) * (window.devicePixelRatio || 1))),
          height: Math.max(1, Math.round((window.visualViewport?.height ?? window.innerHeight) * (window.devicePixelRatio || 1)))
        })
      });
      return parseDimensions(result?.result);
    } catch (error) {
      if (!canFallbackToDebugger(error)) {
        throw error;
      }
    }
  }
  return readViewportDimensionsWithDebugger(tabId);
}

async function readViewportDimensionsWithDebugger(tabId: number): Promise<ScreenshotDimensions> {
  const result = await defaultDebuggerManager.evaluate(tabId, `(() => ({
    width: Math.max(1, Math.round((window.visualViewport?.width ?? window.innerWidth) * (window.devicePixelRatio || 1))),
    height: Math.max(1, Math.round((window.visualViewport?.height ?? window.innerHeight) * (window.devicePixelRatio || 1)))
  }))()`);
  const remoteObject = result.result;
  const value = typeof remoteObject === 'object' && remoteObject !== null
    ? (remoteObject as Record<string, unknown>).value
    : undefined;
  return parseDimensions(value);
}

async function readElementBounds(tabId: number, selector: string): Promise<ScreenshotBounds> {
  if (!globalThis.chrome?.scripting?.executeScript) {
    return readElementBoundsWithDebugger(tabId, selector);
  }
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [selector],
      func: (targetSelector: string) => {
        const element = document.querySelector(targetSelector);
        if (!element) {
          return undefined;
        }
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          selector: targetSelector
        };
      }
    });
    return parseBounds(result?.result, selector);
  } catch (error) {
    if (canFallbackToDebugger(error)) {
      return readElementBoundsWithDebugger(tabId, selector);
    }
    throw error;
  }
}

async function readElementBoundsWithDebugger(tabId: number, selector: string): Promise<ScreenshotBounds> {
  const result = await defaultDebuggerManager.evaluate(tabId, `(() => {
    const targetSelector = ${JSON.stringify(selector)};
    const element = document.querySelector(targetSelector);
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      selector: targetSelector
    };
  })()`);
  const remoteObject = result.result;
  const value = typeof remoteObject === 'object' && remoteObject !== null
    ? (remoteObject as Record<string, unknown>).value
    : undefined;
  return parseBounds(value, selector);
}

function parseBounds(value: unknown, selector: string): ScreenshotBounds {
  if (!isBounds(value)) {
    throw new Error(`Element not found for screenshot selector: ${selector}`);
  }
  return value;
}

function parseDimensions(value: unknown): ScreenshotDimensions {
  if (!isDimensions(value)) {
    throw new Error('Viewport dimensions unavailable for screenshot metadata');
  }
  return {
    width: Math.max(1, Math.round(value.width)),
    height: Math.max(1, Math.round(value.height))
  };
}

function dimensionsFromCapture(captured: CapturedImage): ScreenshotDimensions | undefined {
  return typeof captured.width === 'number' && typeof captured.height === 'number'
    ? parseDimensions(captured)
    : undefined;
}

function canFallbackToDebugger(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /permission|Cannot access contents|activeTab|<all_urls>|unavailable|quota|MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/iu.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function positiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, value)
    : 1;
}

function isBounds(value: unknown): value is ScreenshotBounds {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).x === 'number' &&
    typeof (value as Record<string, unknown>).y === 'number' &&
    typeof (value as Record<string, unknown>).width === 'number' &&
    typeof (value as Record<string, unknown>).height === 'number';
}

function isDimensions(value: unknown): value is ScreenshotDimensions {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).width === 'number' &&
    typeof (value as Record<string, unknown>).height === 'number';
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)/u.exec(dataUrl);
  return match?.[1] ?? 'image/png';
}
