// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { downloadSelectionMarkdown } from '../../../../src/page/selection/selection-markdown-download';

describe('selection markdown download', () => {
  it('downloads markdown through a temporary anchor and cleans up Blob URLs', async () => {
    const createObjectUrl = vi.fn().mockReturnValue('blob:browserhelm-selection');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadSelectionMarkdown({
      document,
      markdown: 'Read [docs](https://example.com/docs)',
      suggestedFileName: 'browserhelm-selection.md',
      createObjectUrl,
      revokeObjectUrl
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    await expect(blob.text()).resolves.toBe('Read [docs](https://example.com/docs)');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="browserhelm-selection.md"]')).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:browserhelm-selection');
  });
});
