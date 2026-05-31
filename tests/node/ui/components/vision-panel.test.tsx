// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { VisionPanel } from '../../../../src/ui/components/vision-panel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('VisionPanel', () => {
  it('renders available vision summaries, blockers, layout issues, and thumbnail metadata', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            observation={{
              imageRef: 'shot_1',
              summary: '按钮被浮层遮挡',
              visibleText: ['Checkout'],
              blockers: ['cookie banner overlaps button'],
              layoutIssues: ['primary CTA shifted below fold'],
              fallback: 'none',
              confidence: 0.88
            }}
            screenshot={{
              mode: 'viewport',
              mimeType: 'image/png',
              width: 1280,
              height: 720
            }}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('视觉检查');
    expect(container.textContent).toContain('按钮被浮层遮挡');
    expect(container.textContent).toContain('cookie banner overlaps button');
    expect(container.textContent).toContain('primary CTA shifted below fold');
    expect(container.textContent).toContain('1280 x 720');
    root.unmount();
    container.remove();
  });

  it('renders DOM/a11y fallback when vision is unavailable', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            observation={{
              summary: 'Vision model is unavailable; use DOM/a11y observation instead.',
              visibleText: [],
              blockers: [],
              layoutIssues: [],
              fallback: 'dom_a11y',
              fallbackReason: 'vision_not_supported'
            }}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('当前 provider 不支持视觉输入');
    expect(container.textContent).toContain('vision_not_supported');
    root.unmount();
    container.remove();
  });
});
