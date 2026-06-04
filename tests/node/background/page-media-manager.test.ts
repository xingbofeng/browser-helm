import { afterEach, describe, expect, it, vi } from 'vitest';

import { PageMediaManager } from '../../../src/background/page-media-manager';
import type { ScreenshotCapture } from '../../../src/shared/schemas/vision';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PageMediaManager', () => {
  it('captures full-page screenshots for http tabs in the current window', async () => {
    const captureFullPage = vi.fn(async (input: { tabId: number; windowId?: number | undefined }) =>
      screenshot(input.tabId)
    );
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 11, windowId: 3, url: 'https://example.com/a', title: 'A' },
          { id: 12, windowId: 3, url: 'chrome://extensions', title: 'Extensions' },
          { id: 13, windowId: 3, url: 'http://localhost:3000/b', title: 'B' }
        ])
      }
    });

    const manager = new PageMediaManager({
      screenshotManager: { captureFullPage }
    });
    const result = await manager.captureFullPageBatch({
      sourceTabId: 11,
      scope: 'current_window',
      maxTabs: 8
    });

    expect(captureFullPage).toHaveBeenCalledTimes(2);
    expect(captureFullPage).toHaveBeenNthCalledWith(1, { tabId: 11, windowId: 3 });
    expect(captureFullPage).toHaveBeenNthCalledWith(2, { tabId: 13, windowId: 3 });
    expect(result).toMatchObject({
      scope: 'current_window',
      requestedTabCount: 2,
      succeededCount: 2,
      failedCount: 0,
      screenshots: [
        { tabId: 11, tabTitle: 'A', pageUrl: 'https://example.com/a' },
        { tabId: 13, tabTitle: 'B', pageUrl: 'http://localhost:3000/b' }
      ]
    });
  });

  it('scrolls before collecting page images and deduplicates discovered URLs', async () => {
    const executeScript = vi.fn(async () => [{
      result: {
        lazyLoad: {
          attempted: true,
          steps: 5,
          initialScrollHeight: 900,
          finalScrollHeight: 3200,
          restoredScrollX: 0,
          restoredScrollY: 120
        },
        images: [
          {
            url: 'https://example.com/hero.jpg',
            rawUrl: '/hero.jpg',
            source: 'img',
            alt: 'Hero',
            width: 640,
            height: 360,
            naturalWidth: 1280,
            naturalHeight: 720,
            visible: true
          },
          {
            url: 'https://example.com/hero.jpg',
            rawUrl: '/hero.jpg',
            source: 'img',
            alt: 'Duplicate hero'
          },
          {
            url: 'https://cdn.example.com/lazy.png',
            rawUrl: 'https://cdn.example.com/lazy.png',
            source: 'css_background',
            visible: false
          }
        ]
      }
    }]);
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 21, windowId: 4, url: 'https://example.com/gallery', title: 'Gallery' }
        ])
      },
      scripting: { executeScript }
    });

    const manager = new PageMediaManager();
    const result = await manager.collectImagesBatch({
      sourceTabId: 21,
      scope: 'current_window',
      maxTabs: 8,
      maxImagesPerTab: 50
    });

    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 21 },
      args: [expect.objectContaining({
        maxImages: 50,
        includeCssBackgrounds: true
      })]
    }));
    expect(result).toMatchObject({
      scope: 'current_window',
      requestedTabCount: 1,
      succeededCount: 1,
      failedCount: 0,
      totalImageCount: 2,
      pages: [
        {
          tabId: 21,
          pageUrl: 'https://example.com/gallery',
          tabTitle: 'Gallery',
          imageCount: 2,
          lazyLoad: {
            attempted: true,
            steps: 5,
            finalScrollHeight: 3200
          }
        }
      ]
    });
    expect(result.pages[0]?.images.map((image) => image.url)).toEqual([
      'https://example.com/hero.jpg',
      'https://cdn.example.com/lazy.png'
    ]);
  });
});

function screenshot(tabId: number): ScreenshotCapture {
  return {
    id: `shot_${tabId}_full_page`,
    tabId,
    mode: 'full_page',
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${tabId}`,
    width: 1200,
    height: 2400,
    captureSource: 'cdp_capture_screenshot',
    truncated: false,
    sensitivity: 'unknown',
    capturedAt: 1,
    traceSafe: false
  };
}
