import {
  screenshotCaptureSchema,
  type ScreenshotBounds,
  type ScreenshotCapture
} from '../shared/schemas/vision';
import { defaultDebuggerManager } from './debugger/debugger-manager';

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

async function captureVisible(input: CaptureViewportInput): Promise<CapturedImage> {
  if (!globalThis.chrome?.tabs?.captureVisibleTab) {
    return captureWithDebugger(input.tabId);
  }
  try {
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
  try {
    return {
      ...await defaultDebuggerManager.captureScreenshot(input.tabId, { fullPage: true }),
      captureSource: 'cdp_capture_screenshot'
    };
  } catch (error) {
    if (!globalThis.chrome?.tabs?.captureVisibleTab) {
      throw error;
    }
    const dataUrl = input.windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(input.windowId, { format: 'png' });
    return {
      dataUrl,
      captureSource: 'tabs_capture_visible_tab',
      fallbackReason: 'cdp_full_page_unavailable_viewport_fallback'
    };
  }
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
  return /permission|Cannot access contents|activeTab|<all_urls>|unavailable/iu.test(message);
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
