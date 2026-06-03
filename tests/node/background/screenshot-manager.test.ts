import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScreenshotManager } from '../../../src/background/screenshot-manager';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScreenshotManager', () => {
  it('captures a redacted viewport screenshot from the active window', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async (windowId: number, options: unknown) => {
          expect(windowId).toBe(7);
          expect(options).toMatchObject({ format: 'png' });
          return 'data:image/png;base64,viewport';
        })
      },
      scripting: {
        executeScript: vi.fn(async () => [{
          result: {
            width: 1280,
            height: 720
          }
        }])
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureViewport({ tabId: 42, windowId: 7 });

    expect(screenshot).toMatchObject({
      id: 'shot_42_viewport',
      tabId: 42,
      mode: 'viewport',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,viewport',
      width: 1280,
      height: 720,
      captureSource: 'tabs_capture_visible_tab',
      truncated: false,
      sensitivity: 'unknown',
      traceSafe: false
    });
  });

  it('captures element screenshots with element bounds metadata', async () => {
    const executeScript = vi.fn(async () => [{
      result: {
        x: 10,
        y: 20,
        width: 200,
        height: 80,
        selector: '#submit'
      }
    }]);
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,element')
      },
      scripting: {
        executeScript
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['viewport'])
    })));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 480 })));
    class FakeOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      async convertToBlob() {
        return new Blob(['cropped'], { type: 'image/png' });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('FileReader', class {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = 'data:image/png;base64,cropped';
        this.onload?.();
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureElement({
      tabId: 42,
      windowId: 7,
      selector: '#submit'
    });

    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42 },
      args: ['#submit']
    }));
    expect(screenshot).toMatchObject({
      mode: 'element',
      bounds: { x: 10, y: 20, width: 200, height: 80 },
      width: 200,
      height: 80,
      selector: '#submit',
      dataUrl: 'data:image/png;base64,cropped',
      captureSource: 'tabs_capture_visible_tab',
      cropStatus: 'cropped',
      truncated: false,
      sensitivity: 'unknown'
    });
  });

  it('marks element screenshots as viewport fallback when crop is unavailable', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,element')
      },
      scripting: {
        executeScript: vi.fn(async () => [{
          result: {
            x: 10,
            y: 20,
            width: 200,
            height: 80,
            selector: '#submit'
          }
        }])
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureElement({
      tabId: 42,
      selector: '#submit'
    });

    expect(screenshot).toMatchObject({
      mode: 'element',
      dataUrl: 'data:image/png;base64,element',
      cropStatus: 'unavailable',
      fallbackReason: 'element_crop_unavailable_viewport_with_bounds_fallback',
      truncated: true
    });
  });

  it('falls back to CDP screenshot when captureVisibleTab lacks host permission', async () => {
    const attach = vi.fn(async () => undefined);
    const detach = vi.fn(async () => undefined);
    const sendCommand = vi.fn(async (_target: unknown, method: string) => {
      if (method === 'Runtime.evaluate') {
        return {
          result: {
            value: {
              width: 1280,
              height: 720
            }
          }
        };
      }
      expect(method).toBe('Page.captureScreenshot');
      return { data: 'cdpviewport' };
    });
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => {
          throw new Error("Either the '<all_urls>' or 'activeTab' permission is required.");
        })
      },
      debugger: {
        attach,
        detach,
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureViewport({ tabId: 42 });

    expect(screenshot.dataUrl).toBe('data:image/png;base64,cdpviewport');
    expect(screenshot).toMatchObject({
      captureSource: 'cdp_capture_screenshot',
      fallbackReason: 'tabs_capture_visible_tab_unavailable',
      truncated: false,
      sensitivity: 'unknown'
    });
    expect(attach).toHaveBeenCalledWith({ tabId: 42 }, '1.3');
    expect(detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it('uses available debugger API without requesting optional permission from the background', async () => {
    const request = vi.fn(async (
      _request: unknown,
      callback: (granted: boolean) => void
    ) => callback(false));
    const sendCommand = vi.fn(async (_target: unknown, method: string) => {
      if (method === 'Runtime.evaluate') {
        return {
          result: {
            value: {
              width: 1280,
              height: 720
            }
          }
        };
      }
      if (method === 'Page.captureScreenshot') {
        return { data: 'cdpviewport' };
      }
      return {};
    });
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => {
          throw new Error("Either the '<all_urls>' or 'activeTab' permission is required.");
        })
      },
      permissions: {
        contains: vi.fn(async (
          _request: unknown,
          callback: (granted: boolean) => void
        ) => callback(false)),
        request
      },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureViewport({ tabId: 42 });

    expect(screenshot.dataUrl).toBe('data:image/png;base64,cdpviewport');
    expect(screenshot.captureSource).toBe('cdp_capture_screenshot');
    expect(request).not.toHaveBeenCalled();
  });

  it('captures full-page screenshots with CDP content bounds instead of viewport fallback', async () => {
    const captureVisibleTab = vi.fn(async () => {
      throw new Error('captureVisibleTab should not be used for full-page screenshots');
    });
    const sendCommand = vi.fn(async (_target: unknown, method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.getLayoutMetrics') {
        return {
          contentSize: {
            x: 0,
            y: 0,
            width: 1440,
            height: 2400
          }
        };
      }
      if (method === 'Page.captureScreenshot') {
        expect(params).toMatchObject({
          format: 'png',
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: 1440,
            height: 2400,
            scale: 1
          }
        });
        return { data: 'fullpage' };
      }
      return {};
    });
    vi.stubGlobal('chrome', {
      tabs: { captureVisibleTab },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureFullPage({ tabId: 42 });

    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(screenshot).toMatchObject({
      id: 'shot_42_full_page',
      mode: 'full_page',
      width: 1440,
      height: 2400,
      dataUrl: 'data:image/png;base64,fullpage'
    });
  });

  it('falls back from full-page capture to viewport metadata with a truncation reason', async () => {
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,viewportfallback');
    const sendCommand = vi.fn(async (_target: unknown, method: string) => {
      if (method === 'Page.getLayoutMetrics') {
        throw new Error('layout metrics unavailable');
      }
      return {};
    });
    vi.stubGlobal('chrome', {
      tabs: { captureVisibleTab },
      scripting: {
        executeScript: vi.fn(async () => [{
          result: { width: 1024, height: 768 }
        }])
      },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const manager = new ScreenshotManager();
    const screenshot = await manager.captureFullPage({ tabId: 42 });

    expect(captureVisibleTab).toHaveBeenCalled();
    expect(screenshot).toMatchObject({
      mode: 'full_page',
      width: 1024,
      height: 768,
      captureSource: 'tabs_capture_visible_tab',
      fallbackReason: 'cdp_full_page_unavailable_viewport_fallback',
      truncated: true,
      sensitivity: 'unknown'
    });
  });

  it('returns a clear unavailable reason when Chrome screenshot APIs are missing', async () => {
    vi.stubGlobal('chrome', {});

    const manager = new ScreenshotManager();
    await expect(manager.captureViewport({ tabId: 42 })).rejects.toThrow(
      'chrome.debugger permission or API is unavailable'
    );
  });
});
