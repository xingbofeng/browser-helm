// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { downloadCurrentSelectionAsMarkdown } from '../../../../src/page/selection/selection-markdown-controller';

describe('selection markdown controller', () => {
  it('turns the current selected DOM range into a downloaded markdown file', () => {
    document.body.innerHTML = `
      <article>
        <h1>Release notes</h1>
        <p>See <a href="/release">the release page</a>.</p>
      </article>
    `;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('article')!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const downloadMarkdown = vi.fn();
    const expectedMarkdown = [
      '# Release notes',
      '',
      'See [the release page](https://browserhelm.example/release).'
    ].join('\n');

    const result = downloadCurrentSelectionAsMarkdown({
      document,
      selection,
      baseUrl: 'https://browserhelm.example/docs/current',
      now: () => new Date('2026-06-04T11:00:00.000Z'),
      downloadMarkdown
    });

    expect(result).toEqual({ ok: true, markdownLength: expectedMarkdown.length });
    expect(downloadMarkdown).toHaveBeenCalledWith(expect.objectContaining({
      document,
      markdown: expectedMarkdown,
      suggestedFileName: 'browserhelm-selection-2026-06-04.md'
    }));
  });

  it('does not download when the selection is empty', () => {
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const downloadMarkdown = vi.fn();

    expect(downloadCurrentSelectionAsMarkdown({
      document,
      selection,
      downloadMarkdown
    })).toEqual({
      ok: false,
      reason: 'empty_selection'
    });
    expect(downloadMarkdown).not.toHaveBeenCalled();
  });
});
