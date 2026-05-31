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

export class ScreenshotManager {
  async captureViewport(input: CaptureViewportInput): Promise<ScreenshotCapture> {
    const dataUrl = await captureVisible(input);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_viewport`,
      tabId: input.tabId,
      mode: 'viewport',
      mimeType: mimeTypeFromDataUrl(dataUrl),
      dataUrl,
      capturedAt: Date.now(),
      traceSafe: false
    });
  }

  async captureFullPage(input: CaptureViewportInput): Promise<ScreenshotCapture> {
    const captured = await captureFullPage(input);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_full_page`,
      tabId: input.tabId,
      mode: 'full_page',
      mimeType: mimeTypeFromDataUrl(captured.dataUrl),
      dataUrl: captured.dataUrl,
      ...(captured.width ? { width: captured.width } : {}),
      ...(captured.height ? { height: captured.height } : {}),
      capturedAt: Date.now(),
      traceSafe: false
    });
  }

  async captureElement(input: CaptureElementInput): Promise<ScreenshotCapture> {
    const bounds = await readElementBounds(input.tabId, input.selector);
    const dataUrl = await captureVisible(input);
    return screenshotCaptureSchema.parse({
      id: `shot_${input.tabId}_element`,
      tabId: input.tabId,
      mode: 'element',
      mimeType: mimeTypeFromDataUrl(dataUrl),
      dataUrl,
      selector: input.selector,
      bounds,
      capturedAt: Date.now(),
      traceSafe: false
    });
  }
}

export const defaultScreenshotManager = new ScreenshotManager();

async function captureVisible(input: CaptureViewportInput): Promise<string> {
  if (!globalThis.chrome?.tabs?.captureVisibleTab) {
    return (await defaultDebuggerManager.captureScreenshot(input.tabId)).dataUrl;
  }
  try {
    return input.windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(input.windowId, { format: 'png' });
  } catch (error) {
    if (canFallbackToDebugger(error)) {
      return (await defaultDebuggerManager.captureScreenshot(input.tabId)).dataUrl;
    }
    throw error;
  }
}

async function captureFullPage(input: CaptureViewportInput): Promise<{
  dataUrl: string;
  width?: number | undefined;
  height?: number | undefined;
}> {
  try {
    return await defaultDebuggerManager.captureScreenshot(input.tabId, { fullPage: true });
  } catch (error) {
    if (!globalThis.chrome?.tabs?.captureVisibleTab) {
      throw error;
    }
    const dataUrl = input.windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(input.windowId, { format: 'png' });
    return { dataUrl };
  }
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

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)/u.exec(dataUrl);
  return match?.[1] ?? 'image/png';
}
