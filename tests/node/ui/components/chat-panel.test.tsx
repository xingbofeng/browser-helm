// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '../../../../src/ui/components/chat-panel';
import { I18nProvider } from '../../../../src/i18n/context';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ChatPanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders task input, run mode dropdown, and swaps send for pause while streaming', () => {
    const html = renderToString(
      <I18nProvider initialLocale="en">
        <ChatPanel
          task="观察当前页面"
          mode="act"
          busy={false}
          canStop={true}
          onTaskChange={() => undefined}
          onModeChange={() => undefined}
          onStart={() => undefined}
          onStop={() => undefined}
        />
      </I18nProvider>
    );

    expect(html).toContain('观察当前页面');
    expect(html).toContain('Act');
    expect(html).toContain('aria-label="Select Run Mode"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('bh-modeSegment');
    expect(html).toContain('aria-label="Pause response"');
    expect(html).not.toContain('aria-label="Start task"');
  });

  it('opens the styled run mode menu and selects a mode', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onModeChange = vi.fn();

    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <ChatPanel
            task="观察当前页面"
            mode="ask"
            busy={false}
            canStop={true}
            onTaskChange={() => undefined}
            onModeChange={onModeChange}
            onStart={() => undefined}
            onStop={() => undefined}
          />
        </I18nProvider>
      );
    });

    act(() => {
      modeButton().click();
    });

    expect(container.querySelector('.bh-modeMenu')).not.toBeNull();
    expect(container.querySelector('.bh-modeSelectArrow')?.getAttribute('data-open')).toBe('true');
    expect(container.textContent).toContain('Act');
    expect(container.textContent).not.toContain('Advanced Debug');
    expect(container.textContent).not.toContain('Execute / Form Strategy');

    act(() => {
      optionButton('Act').click();
    });

    expect(onModeChange).toHaveBeenCalledWith('act');
    expect(container.querySelector('.bh-modeMenu')).toBeNull();
    root.unmount();
  });
});

function modeButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="Select Run Mode"]');
  if (!button) {
    throw new Error('mode button not found');
  }
  return button;
}

function optionButton(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find((candidate) => candidate.textContent?.includes(name));
  if (!button) {
    throw new Error(`option not found: ${name}`);
  }
  return button;
}
