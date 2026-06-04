import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bhVisionBatchCaptureFullPages,
  bhVisionCaptureElement,
  bhVisionCaptureViewport,
  bhVisionCollectImages,
  bhVisionDescribeViewport,
  bhVisionDetectOverlay,
  bhVisionDetectLayoutIssues
} from '../../../../src/tools/vision/bh-vision-tools';
import { snapshotToolResult } from '../../../../src/background/runtime/run/run-snapshot-assembler';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vision tools', () => {
  it('captures viewport screenshots without putting image data into model context', async () => {
    vi.stubGlobal('chrome', chromeWithViewportCapture('data:image/png;base64,viewport'));

    const result = await bhVisionCaptureViewport(rpc()).execute(
      { windowId: 1 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: false,
      context: {
        visibility: 'summary'
      }
    });
    expect(result.summary).toContain('Captured viewport screenshot');
    expect(JSON.stringify(result.context)).not.toContain('base64');
    expect(result.data).toMatchObject({
      screenshot: {
        mode: 'viewport',
        width: 1280,
        height: 720,
        truncated: false,
        sensitivity: 'unknown',
        traceSafe: false
      }
    });
    const snapshot = snapshotToolResult(TOOL_NAMES.VISION_CAPTURE_VIEWPORT, result);
    expect(JSON.stringify(snapshot.detail)).toContain('[MASKED_IMAGE_DATA]');
    expect(JSON.stringify(snapshot.detail)).not.toContain('data:image/png;base64,viewport');
  });

  it('captures element screenshots for a selector', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,element')
      },
      scripting: {
        executeScript: vi.fn(async () => [{
          result: { x: 1, y: 2, width: 100, height: 30, selector: '#cta' }
        }])
      }
    });

    const result = await bhVisionCaptureElement(rpc()).execute(
      { selector: '#cta', windowId: 1 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        screenshot: {
          mode: 'element',
          selector: '#cta',
          bounds: { x: 1, y: 2, width: 100, height: 30 },
          width: 100,
          height: 30,
          cropStatus: 'unavailable',
          fallbackReason: 'element_crop_unavailable_viewport_with_bounds_fallback',
          truncated: true,
          sensitivity: 'unknown'
        }
      }
    });
  });

  it('describes viewport through injected vision client and returns overlay findings', async () => {
    vi.stubGlobal('chrome', chromeWithViewportCapture('data:image/png;base64,viewport'));

    const result = await bhVisionDescribeViewport(rpc()).execute(
      { windowId: 1, prompt: '按钮为什么不可点' },
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'debug',
        tabId: 42,
        snapshot: groundedSnapshot(),
        visionClient: {
          async describeViewport() {
            return {
              ok: true,
              observation: {
                imageRef: 'shot_42_viewport',
                summary: '主要按钮被 cookie banner 遮挡',
                visibleText: [],
                blockers: ['cookie banner overlaps the primary button'],
                layoutIssues: [],
                fallback: 'none',
                grounding: [],
                confidence: 0.9
              }
            };
          }
        }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        observation: {
          summary: '主要按钮被 cookie banner 遮挡',
          blockers: ['cookie banner overlaps the primary button']
        }
      }
    });
    const observation = result.data && typeof result.data === 'object'
      ? (result.data as { observation?: { grounding?: Array<{ claim: string; source: string; confidence: string }>; pointerFallback?: unknown } }).observation
      : undefined;
    expect(observation?.grounding).toContainEqual(expect.objectContaining({
      claim: 'cookie banner overlaps the primary button',
      source: 'a11y_backed',
      confidence: 'high'
    }));
    expect(observation?.pointerFallback).toMatchObject({
      allowed: true,
      targetConfidence: 'high',
      domRefUnavailable: true
    });
  });

  it('falls back to DOM/a11y when no vision client is available', async () => {
    vi.stubGlobal('chrome', chromeWithViewportCapture('data:image/png;base64,viewport'));

    const result = await bhVisionDescribeViewport(rpc()).execute(
      { windowId: 1 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 42 }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VISION_UNAVAILABLE');
    expect(result.summary).toContain('Viewport screenshot captured');
    expect(result.nextHints).toEqual(expect.arrayContaining([
      'The screenshot capture succeeded, but the vision model result is unavailable.',
      'Do not call another vision model tool unless provider settings change.'
    ]));
    expect(result.data).toMatchObject({
      screenshot: {
        dataUrl: 'data:image/png;base64,viewport'
      },
      observation: {
        fallback: 'dom_a11y'
      }
    });
    expect(result.requiresObserve).toBe(false);
  });

  it('treats model-supplied windowId zero as the current window for overlay detection', async () => {
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,viewport');
    vi.stubGlobal('chrome', {
      ...chromeWithViewportCapture('data:image/png;base64,viewport'),
      tabs: {
        captureVisibleTab
      }
    });

    const result = await bhVisionDetectOverlay(rpc()).execute(
      { windowId: 0, prompt: '检查遮挡层' },
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'debug',
        tabId: 42,
        visionClient: {
          async describeViewport() {
            return {
              ok: true,
              observation: {
                summary: '浮层遮挡了主要按钮',
                visibleText: [],
                blockers: ['modal overlay'],
                layoutIssues: [],
                fallback: 'none',
                grounding: [],
                confidence: 0.8
              }
            };
          }
        }
      }
    );

    expect(captureVisibleTab).toHaveBeenCalledWith({ format: 'png' });
    expect(result).toMatchObject({
      ok: true,
      data: {
        observation: {
          blockers: ['modal overlay']
        }
      }
    });
  });

  it('uses focused layout prompt for layout issue detection', async () => {
    vi.stubGlobal('chrome', chromeWithViewportCapture('data:image/png;base64,viewport'));
    let prompt = '';

    const result = await bhVisionDetectLayoutIssues(rpc()).execute(
      { windowId: 1 },
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'debug',
        tabId: 42,
        visionClient: {
          async describeViewport(input) {
            prompt = input.prompt;
            return {
              ok: true,
              observation: {
                summary: 'CTA is clipped below the fold',
                visibleText: [],
                blockers: [],
                layoutIssues: ['CTA clipped below the fold'],
                fallback: 'none',
                grounding: [],
                confidence: 0.8
              }
            };
          }
        }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        observation: {
          layoutIssues: ['CTA clipped below the fold']
        }
      }
    });
    expect(prompt).toContain('layout issues');
  });

  it('batch captures full-page screenshots without exposing image data to model context', async () => {
    installCanvasStubs('data:image/png;base64,stitched-batch');
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 41, windowId: 5, url: 'https://example.com/a', title: 'A' },
          { id: 42, windowId: 5, url: 'https://example.com/b', title: 'B' }
        ]),
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,batchfullpage-tile')
      },
      scripting: {
        executeScript: vi.fn(async (input: { args?: unknown[] }) => {
          if (input.args?.[0] === 'metrics') {
            return [{
              result: {
                scrollX: 0,
                scrollY: 0,
                viewportWidth: 800,
                viewportHeight: 600,
                documentWidth: 800,
                documentHeight: 1400,
                devicePixelRatio: 1
              }
            }];
          }
          if (input.args?.[0] === 'scroll') {
            const scrollY = Number(input.args[2]);
            return [{
              result: {
                scrollX: 0,
                scrollY,
                viewportWidth: 800,
                viewportHeight: 600,
                documentWidth: 800,
                documentHeight: 1400,
                devicePixelRatio: 1
              }
            }];
          }
          if (input.args?.[0] === 'restore') {
            return [{
              result: {
                scrollX: 0,
                scrollY: 0,
                viewportWidth: 800,
                viewportHeight: 600,
                documentWidth: 800,
                documentHeight: 1400,
                devicePixelRatio: 1
              }
            }];
          }
          return [{
            result: {
              attempted: true,
              steps: 3,
              initialScrollHeight: 1000,
              finalScrollHeight: 2000,
              restoredScrollX: 0,
              restoredScrollY: 0
            }
          }];
        })
      }
    });

    const result = await bhVisionBatchCaptureFullPages(rpc()).execute(
      { scope: 'current_window', maxTabs: 8 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 41 }
    );

    expect(result).toMatchObject({
      ok: true,
      context: { visibility: 'summary' },
      data: {
        batchCapture: {
          requestedTabCount: 2,
          succeededCount: 2,
          failedCount: 0
        }
      }
    });
    expect(result.summary).toContain('Captured 2 full-page screenshots');
    expect(JSON.stringify(result.context)).not.toContain('base64');
    const snapshot = snapshotToolResult(TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES, result);
    expect(JSON.stringify(snapshot.detail)).toContain('[MASKED_IMAGE_DATA]');
    expect(JSON.stringify(snapshot.detail)).not.toContain('data:image/png;base64,batchfullpage');
  });

  it('collects page image URLs after lazy-load scrolling', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 51, windowId: 6, url: 'https://example.com/gallery', title: 'Gallery' }
        ])
      },
      scripting: {
        executeScript: vi.fn(async () => [{
          result: {
            lazyLoad: {
              attempted: true,
              steps: 6,
              initialScrollHeight: 800,
              finalScrollHeight: 3000,
              restoredScrollX: 0,
              restoredScrollY: 0
            },
            images: [
              {
                url: 'https://example.com/hero.jpg',
                rawUrl: '/hero.jpg',
                source: 'img',
                alt: 'Hero'
              }
            ]
          }
        }])
      }
    });

    const result = await bhVisionCollectImages(rpc()).execute(
      { scope: 'current_window', maxTabs: 8, maxImagesPerTab: 50, includeCssBackgrounds: true },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 51 }
    );

    expect(result).toMatchObject({
      ok: true,
      changedPage: false,
      requiresObserve: false,
      data: {
        imageCollection: {
          requestedTabCount: 1,
          succeededCount: 1,
          totalImageCount: 1,
          pages: [
            {
              tabId: 51,
              imageCount: 1,
              lazyLoad: {
                attempted: true,
                steps: 6
              },
              images: [
                {
                  url: 'https://example.com/hero.jpg',
                  source: 'img'
                }
              ]
            }
          ]
        }
      }
    });
    expect(result.summary).toContain('Collected 1 images');
  });

  it('registers stable v1.4 tool names', () => {
    expect(bhVisionCaptureViewport(rpc()).name).toBe(TOOL_NAMES.VISION_CAPTURE_VIEWPORT);
    expect(bhVisionDescribeViewport(rpc()).name).toBe(TOOL_NAMES.VISION_DESCRIBE_VIEWPORT);
    expect(bhVisionBatchCaptureFullPages(rpc()).name).toBe(TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES);
    expect(bhVisionCollectImages(rpc()).name).toBe(TOOL_NAMES.VISION_COLLECT_IMAGES);
  });
});

function rpc(): ContentRpcClient {
  return {
    async request() {
      return { ok: false, code: 'CONTENT_SCRIPT_UNAVAILABLE', message: 'unused' };
    }
  };
}

function groundedSnapshot() {
  return {
    runId: 'run_1',
    mode: 'debug' as const,
    status: 'observed' as const,
    structuredPageData: {
      observation: {
        status: 'ready' as const,
        summary: 'cookie banner primary button',
        count: 1,
        items: [{
          url: 'https://example.test',
          title: 'Fixture',
          currentDomain: 'example.test',
          origin: 'https://example.test',
          visibleTextSummary: 'cookie banner primary button',
          pageStateSummary: 'cookie banner primary button'
        }],
        updatedAt: '2026-06-02T00:00:00.000Z',
        warnings: []
      },
      refs: {
        status: 'ready' as const,
        summary: 'primary button',
        count: 1,
        items: [{
          refId: 'ref_primary',
          role: 'button',
          name: 'primary button',
          tagName: 'button',
          visible: true,
          disabled: false
        }],
        updatedAt: '2026-06-02T00:00:00.000Z',
        warnings: []
      },
      interactive: {
        status: 'ready' as const,
        summary: 'primary button',
        count: 1,
        items: [{
          refId: 'ref_primary',
          role: 'button',
          name: 'primary button',
          tagName: 'button',
          visible: true,
          disabled: false,
          warnings: []
        }],
        updatedAt: '2026-06-02T00:00:00.000Z',
        warnings: []
      },
      forms: {
        status: 'ready' as const,
        summary: 'No forms',
        count: 0,
        items: [],
        updatedAt: '2026-06-02T00:00:00.000Z',
        warnings: []
      }
    }
  };
}

function chromeWithViewportCapture(dataUrl: string) {
  return {
    tabs: {
      captureVisibleTab: vi.fn(async () => dataUrl)
    },
    scripting: {
      executeScript: vi.fn(async () => [{
        result: { width: 1280, height: 720 }
      }])
    }
  };
}

function installCanvasStubs(outputDataUrl: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    blob: async () => new Blob([url])
  })));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600 })));
  vi.stubGlobal('OffscreenCanvas', class {
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
      return new Blob(['stitched'], { type: 'image/png' });
    }
  });
  vi.stubGlobal('FileReader', class {
    result: string | ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      this.result = outputDataUrl;
      this.onload?.();
    }
  });
}
