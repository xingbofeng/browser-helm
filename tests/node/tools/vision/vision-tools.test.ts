import { afterEach, describe, expect, it, vi } from 'vitest';

import { bhVisionCaptureElement, bhVisionCaptureViewport, bhVisionDescribeViewport } from '../../../../src/tools/vision/bh-vision-tools';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vision tools', () => {
  it('captures viewport screenshots without putting image data into model context', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,viewport')
      }
    });

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
          bounds: { x: 1, y: 2, width: 100, height: 30 }
        }
      }
    });
  });

  it('describes viewport through injected vision client and returns overlay findings', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,viewport')
      }
    });

    const result = await bhVisionDescribeViewport(rpc()).execute(
      { windowId: 1, prompt: '按钮为什么不可点' },
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
                imageRef: 'shot_42_viewport',
                summary: '主要按钮被 cookie banner 遮挡',
                visibleText: [],
                blockers: ['cookie banner overlaps the primary button'],
                layoutIssues: [],
                fallback: 'none',
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
  });

  it('falls back to DOM/a11y when no vision client is available', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,viewport')
      }
    });

    const result = await bhVisionDescribeViewport(rpc()).execute(
      { windowId: 1 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 42 }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'VISION_UNAVAILABLE',
      data: {
        observation: {
          fallback: 'dom_a11y'
        }
      },
      requiresObserve: false
    });
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
