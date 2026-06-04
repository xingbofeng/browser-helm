// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONTEXT_MENU_DOWNLOAD_MESSAGE,
  handleContextMenuDownloadMessage
} from '../../../../src/page/selection/context-menu-downloads';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('context menu downloads', () => {
  it('downloads data URL image payloads from the page', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(handleContextMenuDownloadMessage({
      document,
      message: {
        type: CONTEXT_MENU_DOWNLOAD_MESSAGE,
        downloads: [{
          kind: 'data_url',
          fileName: 'browserhelm-viewport.png',
          dataUrl: 'data:image/png;base64,viewport'
        }]
      }
    })).resolves.toEqual({ ok: true, downloadedCount: 1 });

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="browserhelm-viewport.png"]')).toBeNull();
  });

  it('creates and downloads a zip for image collection payloads', async () => {
    const createObjectUrl = vi.fn().mockReturnValue('blob:browserhelm-images');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const imageCollection = {
      scope: 'active_tab',
      requestedTabCount: 1,
      succeededCount: 1,
      failedCount: 0,
      totalImageCount: 0,
      pages: [],
      failures: []
    };
    const zip = new Blob(['zip'], { type: 'application/zip' });
    const createImageCollectionZip = vi.fn().mockResolvedValue(zip);

    await expect(handleContextMenuDownloadMessage({
      document,
      message: {
        type: CONTEXT_MENU_DOWNLOAD_MESSAGE,
        downloads: [{
          kind: 'image_collection_zip',
          fileName: 'browserhelm-page-images.zip',
          imageCollection
        }]
      },
      createObjectUrl,
      revokeObjectUrl,
      createImageCollectionZip
    })).resolves.toEqual({ ok: true, downloadedCount: 1 });

    expect(createImageCollectionZip).toHaveBeenCalledWith(imageCollection);
    expect(createObjectUrl).toHaveBeenCalledWith(zip);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="browserhelm-page-images.zip"]')).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:browserhelm-images');
  });

  it('ignores unrelated messages', async () => {
    await expect(handleContextMenuDownloadMessage({
      document,
      message: { type: 'OTHER' }
    })).resolves.toEqual({ ok: false, reason: 'unsupported_message' });
  });
});
