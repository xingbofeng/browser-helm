// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { listShadowRoots, queryShadowRoot } from '../../../../src/page/shadow/shadow-dom';

describe('shadow DOM reader', () => {
  it('lists open shadow roots with host and text summaries', () => {
    document.body.innerHTML = '<x-search id="search-widget"></x-search><x-closed id="closed-widget"></x-closed>';
    const openHost = document.querySelector('#search-widget') as HTMLElement;
    const openRoot = openHost.attachShadow({ mode: 'open' });
    openRoot.innerHTML = '<label>Search <input aria-label="Search docs"></label><button>Go</button>';
    const closedHost = document.querySelector('#closed-widget') as HTMLElement;
    closedHost.attachShadow({ mode: 'closed' });

    const roots = listShadowRoots(document);

    expect(roots).toEqual([expect.objectContaining({
      hostSelector: '#search-widget',
      hostTagName: 'x-search',
      mode: 'open',
      interactiveCount: 2,
      textPreview: 'Search Go'
    })]);
  });

  it('queries elements inside a selected shadow root', () => {
    document.body.innerHTML = '<x-menu id="menu-widget"></x-menu>';
    const host = document.querySelector('#menu-widget') as HTMLElement;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button aria-label="Open menu">☰</button><a href="/settings">Settings</a>';

    const result = queryShadowRoot(document, {
      hostSelector: '#menu-widget',
      selector: 'button, a'
    });

    expect(result).toMatchObject({
      hostSelector: '#menu-widget',
      elements: [
        { tagName: 'button', name: 'Open menu', role: 'button' },
        { tagName: 'a', name: 'Settings', role: 'link' }
      ]
    });
  });
});
