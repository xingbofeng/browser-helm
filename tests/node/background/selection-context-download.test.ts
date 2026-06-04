import { describe, expect, it, vi } from 'vitest';

import {
  CONTEXT_MENU_DOWNLOAD_MESSAGE,
  downloadVisionToolResult
} from '../../../src/background/selection-context-download';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';

describe('selection context menu downloads', () => {
  it('downloads a viewport screenshot image through the clicked tab', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const download = vi.fn().mockResolvedValue(1001);

    await downloadVisionToolResult({
      tabId: 42,
      frameId: 7,
      tool: TOOL_NAMES.VISION_CAPTURE_VIEWPORT,
      result: {
        ok: true,
        code: 'OK',
        summary: 'Captured viewport screenshot',
        data: {
          screenshot: {
            id: 'shot_42_viewport',
            mode: 'viewport',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,viewport'
          }
        }
      },
      chromeApi: { tabs: { sendMessage }, downloads: { download } }
    });

    expect(download).toHaveBeenCalledWith({
      url: 'data:image/png;base64,viewport',
      filename: 'browserhelm-viewport-shot_42_viewport.png',
      saveAs: false
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to the clicked tab when the downloads API is unavailable', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });

    await downloadVisionToolResult({
      tabId: 42,
      frameId: 7,
      tool: TOOL_NAMES.VISION_CAPTURE_VIEWPORT,
      result: {
        ok: true,
        code: 'OK',
        summary: 'Captured viewport screenshot',
        data: {
          screenshot: {
            id: 'shot_42_viewport',
            mode: 'viewport',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,viewport'
          }
        }
      },
      chromeApi: { tabs: { sendMessage } }
    });

    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: CONTEXT_MENU_DOWNLOAD_MESSAGE,
      downloads: [{
        kind: 'data_url',
        fileName: 'browserhelm-viewport-shot_42_viewport.png',
        dataUrl: 'data:image/png;base64,viewport'
      }]
    }, { frameId: 7 });
  });

  it('downloads all batch long screenshots as image files', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const download = vi.fn().mockResolvedValue(1002);

    await downloadVisionToolResult({
      tabId: 42,
      tool: TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES,
      result: {
        ok: true,
        code: 'OK',
        summary: 'Captured batch screenshots',
        data: {
          batchCapture: {
            screenshots: [
              {
                tabId: 42,
                tabTitle: 'Product Page',
                screenshot: {
                  id: 'shot_42_full_page',
                  mode: 'full_page',
                  mimeType: 'image/png',
                  dataUrl: 'data:image/png;base64,fullpage'
                }
              }
            ]
          }
        }
      },
      chromeApi: { tabs: { sendMessage }, downloads: { download } }
    });

    expect(download).toHaveBeenCalledWith({
      url: 'data:image/png;base64,fullpage',
      filename: 'browserhelm-full-page-product-page-shot_42_full_page.png',
      saveAs: false
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('downloads collected page images as a zip payload', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const imageCollection = {
      scope: 'active_tab',
      requestedTabCount: 1,
      succeededCount: 1,
      failedCount: 0,
      totalImageCount: 1,
      pages: [],
      failures: []
    };

    await downloadVisionToolResult({
      tabId: 42,
      tool: TOOL_NAMES.VISION_COLLECT_IMAGES,
      result: {
        ok: true,
        code: 'OK',
        summary: 'Collected images',
        data: { imageCollection }
      },
      chromeApi: { tabs: { sendMessage } }
    });

    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: CONTEXT_MENU_DOWNLOAD_MESSAGE,
      downloads: [{
        kind: 'image_collection_zip',
        fileName: 'browserhelm-page-images.zip',
        imageCollection
      }]
    }, undefined);
  });

  it('does not send a download message when the tool result failed or has no downloadable data', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });

    await downloadVisionToolResult({
      tabId: 42,
      tool: TOOL_NAMES.VISION_CAPTURE_VIEWPORT,
      result: {
        ok: false,
        code: 'ERROR',
        summary: 'failed'
      },
      chromeApi: { tabs: { sendMessage } }
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
