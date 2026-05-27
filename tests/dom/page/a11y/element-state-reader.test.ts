// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { readElementState } from '../../../../src/page/a11y/element-state-reader';
import { loadDomFixture } from '../../../helpers/dom-test-page';

describe('element-state-reader', () => {
  it('reads visible and disabled state from DOM and ARIA signals', () => {
    const page = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    );
    const disabledButton = page.document.querySelector('button[disabled]');
    const hiddenButton = page.document.createElement('button');
    hiddenButton.textContent = '隐藏按钮';
    hiddenButton.setAttribute('hidden', '');
    page.document.body.append(hiddenButton);

    expect(readElementState(disabledButton)).toMatchObject({
      visible: true,
      disabled: true,
      warnings: []
    });
    expect(readElementState(hiddenButton)).toMatchObject({
      visible: false,
      disabled: false
    });
  });

  it('treats elements hidden by CSS or hidden ancestors as not visible', () => {
    document.body.innerHTML = `
      <style>
        .css-hidden { display: none; }
        .transparent { opacity: 0; }
      </style>
      <button class="css-hidden">CSS hidden</button>
      <button class="transparent">Transparent</button>
      <div style="visibility:hidden">
        <button id="child">Hidden child</button>
      </div>
    `;

    expect(readElementState(document.querySelector('.css-hidden'))).toMatchObject({
      visible: false
    });
    expect(readElementState(document.querySelector('.transparent'))).toMatchObject({
      visible: false
    });
    expect(readElementState(document.querySelector('#child'))).toMatchObject({
      visible: false
    });
  });

  it('reads checked and selected state when available', () => {
    const page = loadDomFixture(
      'interactive-complete.html',
      'https://demo.example.com/interactive'
    );

    expect(readElementState(page.document.querySelector('[role="switch"]'))).toMatchObject({
      checked: true
    });
    expect(readElementState(page.document.querySelector('[role="tab"]'))).toMatchObject({
      selected: false
    });
    expect(readElementState(page.document.querySelector('select option[selected]'))).toMatchObject({
      selected: true
    });
  });

  it('keeps a warning when state cannot be read because the element is missing', () => {
    expect(readElementState(null)).toMatchObject({
      visible: false,
      disabled: false,
      warnings: [
        expect.objectContaining({
          code: 'ELEMENT_STATE_UNREADABLE'
        })
      ]
    });
  });
});
