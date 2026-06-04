// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import {
  markdownFromSelection,
  markdownFromSelectionFragment
} from '../../../../src/page/selection/selection-markdown';

describe('selection markdown export', () => {
  it('preserves headings, lists, and links from the selected DOM', () => {
    const fragment = document.createDocumentFragment();
    const article = document.createElement('article');
    article.innerHTML = `
      <h2>Install BrowserHelm</h2>
      <p>Read the <a href="/docs/start?from=menu#setup">setup guide</a> before continuing.</p>
      <ul>
        <li>Open the extension</li>
        <li><a href="https://example.com/checklist">Check the list</a></li>
      </ul>
    `;
    fragment.append(article);

    const markdown = markdownFromSelectionFragment(fragment, {
      baseUrl: 'https://browserhelm.example/app/page'
    });

    expect(markdown).toBe([
      '## Install BrowserHelm',
      '',
      'Read the [setup guide](https://browserhelm.example/docs/start?from=menu#setup) before continuing.',
      '',
      '- Open the extension',
      '- [Check the list](https://example.com/checklist)'
    ].join('\n'));
  });

  it('skips scripts, styles, templates, and hidden content', () => {
    const fragment = document.createDocumentFragment();
    const section = document.createElement('section');
    section.innerHTML = `
      <p>Visible text</p>
      <script>window.secret = "token"</script>
      <style>.secret { display: block; }</style>
      <template><p>Template copy</p></template>
      <p hidden>Hidden copy</p>
      <p aria-hidden="true">ARIA hidden copy</p>
    `;
    fragment.append(section);

    const markdown = markdownFromSelectionFragment(fragment, {
      baseUrl: 'https://browserhelm.example/'
    });

    expect(markdown).toBe('Visible text');
  });

  it('converts tables, blockquotes, code blocks, and images without dropping links', () => {
    const fragment = document.createDocumentFragment();
    const section = document.createElement('section');
    section.innerHTML = `
      <blockquote><p>Quoted <a href="/source">source</a></p></blockquote>
      <pre><code>npm run build</code></pre>
      <p><img src="/logo.png" alt="BrowserHelm logo"></p>
      <table>
        <thead><tr><th>Name</th><th>URL</th></tr></thead>
        <tbody><tr><td>Docs</td><td><a href="/docs">Open docs</a></td></tr></tbody>
      </table>
    `;
    fragment.append(section);

    const markdown = markdownFromSelectionFragment(fragment, {
      baseUrl: 'https://browserhelm.example/app/'
    });

    expect(markdown).toContain('> Quoted [source](https://browserhelm.example/source)');
    expect(markdown).toContain('```');
    expect(markdown).toContain('npm run build');
    expect(markdown).toContain('![BrowserHelm logo](https://browserhelm.example/logo.png)');
    expect(markdown).toContain('| Name | URL |');
    expect(markdown).toContain('| Docs | [Open docs](https://browserhelm.example/docs) |');
  });

  it('returns a clear empty-selection result when there is no selected range', () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();

    expect(markdownFromSelection(selection, {
      document,
      baseUrl: 'https://browserhelm.example/'
    })).toEqual({
      ok: false,
      reason: 'empty_selection'
    });
  });
});
