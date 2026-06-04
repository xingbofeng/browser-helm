// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

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

  it('offers batch long screenshot and image collection actions with summarized results', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let batchCaptures = 0;
    let imageCollections = 0;

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            batchCapture={{
              scope: 'current_window',
              requestedTabCount: 2,
              succeededCount: 2,
              failedCount: 0,
              screenshots: [
                {
                  tabId: 31,
                  tabTitle: '产品页',
                  pageUrl: 'https://example.com/product',
                  screenshot: {
                    id: 'shot_31_full_page',
                    tabId: 31,
                    mode: 'full_page',
                    mimeType: 'image/png',
                    dataUrl: 'data:image/png;base64,batch31',
                    width: 1200,
                    height: 2800,
                    captureSource: 'cdp_capture_screenshot',
                    truncated: false,
                    sensitivity: 'unknown',
                    capturedAt: 1,
                    traceSafe: false
                  }
                },
                {
                  tabId: 32,
                  tabTitle: '列表页',
                  pageUrl: 'https://example.com/list',
                  screenshot: {
                    id: 'shot_32_full_page',
                    tabId: 32,
                    mode: 'full_page',
                    mimeType: 'image/png',
                    dataUrl: 'data:image/png;base64,batch32',
                    width: 1000,
                    height: 2200,
                    captureSource: 'cdp_capture_screenshot',
                    truncated: false,
                    sensitivity: 'unknown',
                    capturedAt: 1,
                    traceSafe: false
                  }
                }
              ],
              failures: []
            }}
            imageCollection={{
              scope: 'current_window',
              requestedTabCount: 1,
              succeededCount: 1,
              failedCount: 0,
              totalImageCount: 2,
              pages: [
                {
                  tabId: 31,
                  pageUrl: 'https://example.com/product',
                  tabTitle: '产品页',
                  imageCount: 2,
                  lazyLoad: {
                    attempted: true,
                    steps: 4,
                    initialScrollHeight: 900,
                    finalScrollHeight: 3000,
                    restoredScrollX: 0,
                    restoredScrollY: 0
                  },
                  images: [
                    { url: 'https://example.com/hero.jpg', rawUrl: '/hero.jpg', source: 'img', alt: 'Hero' },
                    { url: 'https://cdn.example.com/bg.png', rawUrl: 'https://cdn.example.com/bg.png', source: 'css_background' }
                  ]
                }
              ],
              failures: []
            }}
            onCaptureFullPages={() => {
              batchCaptures += 1;
            }}
            onCollectImages={() => {
              imageCollections += 1;
            }}
          />
        </I18nProvider>
      );
    });

    const batchButton = [...container.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '批量截取长图');
    const imageButton = [...container.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '批量获取图片');
    expect(batchButton).toBeInstanceOf(HTMLButtonElement);
    expect(imageButton).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      batchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      imageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(batchCaptures).toBe(1);
    expect(imageCollections).toBe(1);
    expect(container.textContent).toContain('长图 2/2');
    expect(container.textContent).toContain('产品页');
    expect(container.textContent).toContain('列表页');
    expect(container.textContent).toContain('图片 2 张');
    expect(container.textContent).toContain('https://example.com/hero.jpg');
    expect(container.textContent).toContain('懒加载滚动 4 次');
    const batchPreviewImages = [...container.querySelectorAll<HTMLImageElement>('.bh-visionBatchPreview img')]
      .map((image) => image.getAttribute('src'));
    expect(batchPreviewImages).toEqual([
      'data:image/png;base64,batch31',
      'data:image/png;base64,batch32'
    ]);
    expect(container.querySelector('button[aria-label="下载图片 ZIP"]')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelectorAll('a[download]').length).toBeGreaterThanOrEqual(3);
    await unmountRoot(root);
    container.remove();
  });

  it('downloads collected page images as a zip with image files and a manifest', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const createdUrls: Blob[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      headers: new Headers({ 'content-type': url.endsWith('.png') ? 'image/png' : 'image/jpeg' }),
      blob: async () => new Blob([url.endsWith('.png') ? 'png-bytes' : 'jpg-bytes'], {
        type: url.endsWith('.png') ? 'image/png' : 'image/jpeg'
      })
    })));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        createdUrls.push(blob);
        return 'blob:browserhelm-images';
      }),
      revokeObjectURL: vi.fn()
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    act(() => {
      root.render(
        <I18nProvider initialLocale="zh">
          <VisionPanel
            imageCollection={{
              scope: 'current_window',
              requestedTabCount: 1,
              succeededCount: 1,
              failedCount: 0,
              totalImageCount: 2,
              pages: [
                {
                  tabId: 31,
                  pageUrl: 'https://example.com/gallery',
                  tabTitle: '图库',
                  imageCount: 2,
                  lazyLoad: {
                    attempted: true,
                    steps: 2,
                    initialScrollHeight: 900,
                    finalScrollHeight: 1400,
                    restoredScrollX: 0,
                    restoredScrollY: 0
                  },
                  images: [
                    { url: 'https://example.com/hero.jpg', source: 'img', alt: 'Hero' },
                    { url: 'https://cdn.example.com/bg.png', source: 'css_background' }
                  ]
                }
              ],
              failures: []
            }}
          />
        </I18nProvider>
      );
    });

    const zipButton = container.querySelector<HTMLButtonElement>('button[aria-label="下载图片 ZIP"]');
    expect(zipButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      zipButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/hero.jpg');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn.example.com/bg.png');
    expect(createdUrls).toHaveLength(1);
    const zipBlob = createdUrls[0];
    expect(zipBlob?.type).toBe('application/zip');
    if (!zipBlob) {
      throw new Error('zip blob was not created');
    }
    const zipText = Buffer.from(await zipBlob.arrayBuffer()).toString('latin1');
    expect(zipText).toContain('images/tab-31/001-hero.jpg');
    expect(zipText).toContain('images/tab-31/002-bg.png');
    expect(zipText).toContain('manifest.json');
    expect(clickSpy).toHaveBeenCalled();

    await unmountRoot(root);
    container.remove();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

async function unmountRoot(root: ReturnType<typeof createRoot>): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}
