// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../../src/i18n/context';
import { VisionPanel } from '../../../../src/ui/components/vision-panel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('VisionPanel', () => {
  it('renders available vision summaries, blockers, layout issues, and thumbnail metadata', async () => {
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
              grounding: [],
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
    await unmountRoot(root);
    container.remove();
  });

  it('renders vision as enhanced evidence with grounding and pointer fallback state', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            observation={{
              imageRef: 'shot_2',
              summary: '发现遮挡层覆盖主按钮',
              visibleText: ['Subscribe'],
              blockers: ['overlay found near primary button'],
              layoutIssues: ['CTA overlaps footer'],
              fallback: 'none',
              confidence: 0.91,
              grounding: [
                {
                  claim: 'overlay found near primary button',
                  source: 'dom_backed',
                  confidence: 'high',
                  evidence: [{ kind: 'dom_text', text: 'Subscribe' }]
                },
                {
                  claim: 'CTA visual bounds require pointer fallback',
                  source: 'visual_only',
                  confidence: 'medium',
                  evidence: [],
                  reason: 'DOM ref is hidden by overlay'
                }
              ],
              pointerFallback: {
                allowed: true,
                targetConfidence: 'high',
                domRefUnavailable: true,
                reason: 'No stable DOM ref maps to the visible CTA.'
              }
            }}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('增强视觉证据');
    expect(container.textContent).toContain('DOM 佐证');
    expect(container.textContent).toContain('纯视觉');
    expect(container.textContent).toContain('overlay found near primary button');
    expect(container.textContent).toContain('Subscribe');
    expect(container.textContent).toContain('指针回退已允许');
    expect(container.textContent).toContain('No stable DOM ref maps to the visible CTA.');
    await unmountRoot(root);
    container.remove();
  });

  it('renders screenshot failure as a dedicated product state', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel error="tabs.captureVisibleTab failed" />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('截图失败');
    expect(container.textContent).toContain('tabs.captureVisibleTab failed');
    await unmountRoot(root);
    container.remove();
  });

  it('renders DOM/a11y fallback when vision is unavailable', async () => {
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
              fallbackReason: 'vision_not_supported',
              grounding: []
            }}
          />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain('当前 provider 不支持视觉输入');
    expect(container.textContent).toContain('vision_not_supported');
    await unmountRoot(root);
    container.remove();
  });

  it('offers direct screenshot actions and renders an ephemeral local preview', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let captures = 0;

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            screenshot={{
              mode: 'viewport',
              mimeType: 'image/png',
              width: 800,
              height: 600,
              dataUrl: 'data:image/png;base64,preview'
            }}
            message="截图已捕获"
            onCaptureViewport={() => {
              captures += 1;
            }}
            onDetectOverlay={() => undefined}
          />
        </I18nProvider>
      );
    });

    const captureButton = [...container.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '截取视口');
    expect(captureButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      captureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(captures).toBe(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,preview');
    const downloadLink = container.querySelector<HTMLAnchorElement>('a[download]');
    expect(downloadLink?.getAttribute('href')).toBe('data:image/png;base64,preview');
    expect(downloadLink?.getAttribute('aria-label')).toBe('下载截图');
    expect(container.textContent).toContain('截图已捕获');
    expect(container.textContent).toContain('800 x 600');
    await unmountRoot(root);
    container.remove();
  });
});

async function unmountRoot(root: ReturnType<typeof createRoot>): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}
