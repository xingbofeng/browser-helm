// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '../../../../src/ui/components/chat-panel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ChatPanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders task input, run mode dropdown, and swaps send for pause while streaming', () => {
    const html = renderToString(
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
    );

    expect(html).toContain('观察当前页面');
    expect(html).toContain('动作准备 / Act');
    expect(html).toContain('aria-label="选择 Run Mode"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('bh-modeSegment');
    expect(html).toContain('aria-label="暂停回复"');
    expect(html).not.toContain('aria-label="启动任务"');
  });

  it('opens the styled run mode menu and selects a mode', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onModeChange = vi.fn();

    act(() => {
      root.render(
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
      );
    });

    act(() => {
      modeButton().click();
    });

    expect(container.querySelector('.bh-modeMenu')).not.toBeNull();
    expect(container.querySelector('.bh-modeSelectArrow')?.getAttribute('data-open')).toBe('true');
    expect(container.textContent).toContain('调试 / Debug');

    act(() => {
      optionButton('调试 / Debug').click();
    });

    expect(onModeChange).toHaveBeenCalledWith('debug');
    expect(container.querySelector('.bh-modeMenu')).toBeNull();
    root.unmount();
  });
});

function modeButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="选择 Run Mode"]');
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
