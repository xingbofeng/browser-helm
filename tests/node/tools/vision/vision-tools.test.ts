import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bhVisionCaptureElement,
  bhVisionCaptureViewport,
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
          truncated: false,
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

  it('registers stable v1.4 tool names', () => {
    expect(bhVisionCaptureViewport(rpc()).name).toBe(TOOL_NAMES.VISION_CAPTURE_VIEWPORT);
    expect(bhVisionDescribeViewport(rpc()).name).toBe(TOOL_NAMES.VISION_DESCRIBE_VIEWPORT);
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
