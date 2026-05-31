import { expect, type Page } from '@playwright/test';
import { E2EFlowContext } from './e2e-flow-context';

export class FloatingPanelFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<FloatingPanelFlow> {
    return new FloatingPanelFlow(await E2EFlowContext.create());
  }

  /** 页面加载后右侧出现 BrowserHelm floating host 元素。 */
  async expectFloatingIconVisible(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    await waitForFloatingButton(fixture.page);
    await expect(fixture.page.locator('#browserhelm-floating-entry-host')).toBeAttached();

    const buttonExists = await fixture.page.evaluate(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      if (!hostEl?.shadowRoot) return false;
      const btn = hostEl.shadowRoot.querySelector('.entryButton');
      return btn !== null;
    });
    expect(buttonExists).toBe(true);
  }

  /** 点击 icon 设置 data-open="true"。 */
  async expectExpandSetsDataOpen(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    await clickFloatingButton(fixture.page);

    // 验证 data-open 属性被设置
    await expect(
      fixture.page.locator('#browserhelm-floating-entry-host')
    ).toHaveAttribute('data-open', 'true');
  }

  /** 展开后 iframe 指向 active target sidepanel URL。 */
  async expectExpandedPanelUsesActiveTargetUrl(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    await clickFloatingButton(fixture.page);

    await expect(
      fixture.page.locator('#browserhelm-floating-entry-host')
    ).toHaveAttribute('data-open', 'true');

    const iframeSrc = await fixture.page.waitForFunction(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      const iframe = hostEl?.shadowRoot?.querySelector('iframe');
      return iframe?.getAttribute('src') ?? null;
    });
    const src = String(await iframeSrc.jsonValue());
    expect(src).toMatch(/^chrome-extension:\/\//u);
    expect(src).toContain('/sidepanel.html?');
    expect(src).toContain('target=active');
    expect(src).toMatch(/[?&]tabId=\d+/u);
  }

  /** Alt/Opt+Shift+B 快捷键可以展开和收起 floating panel。 */
  async expectKeyboardShortcutTogglesPanel(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    const host = fixture.page.locator('#browserhelm-floating-entry-host');
    await waitForFloatingButton(fixture.page);

    await fixture.page.keyboard.press('Alt+Shift+B');
    await expect(host).toHaveAttribute('data-open', 'true');

    await fixture.page.keyboard.press('Alt+Shift+B');
    await fixture.page.waitForFunction(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      return hostEl && !hostEl.hasAttribute('data-open');
    }, { timeout: 5000 });
  }

  /** 再次点击 icon 收起面板（data-open 移除）。 */
  async expectToggleCollapse(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const page = fixture.page;

    await clickFloatingButton(page);

    await expect(
      page.locator('#browserhelm-floating-entry-host')
    ).toHaveAttribute('data-open', 'true');

    await clickFloatingButton(page);

    // 等待 data-open 移除
    await page.waitForFunction(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      return hostEl && !hostEl.hasAttribute('data-open');
    }, { timeout: 5000 });
  }

  /** icon tooltip 包含快捷键提示。 */
  async expectIconHasShortcutTooltip(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');
    await waitForFloatingButton(fixture.page);

    const title = await fixture.page.evaluate(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      if (!hostEl?.shadowRoot) return null;
      const btn = hostEl.shadowRoot.querySelector('.entryButton');
      return btn?.getAttribute('title') ?? null;
    });

    expect(title).toBeTruthy();
    expect(title).toContain('Ctrl+Shift+B');
    expect(title).toContain('Opt+Shift+B');
  }

  /** icon 图片使用项目图标，不挂图 (naturalWidth > 0)。 */
  async expectIconImageLoaded(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const imageLoaded = await fixture.page.waitForFunction(async () => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      if (!hostEl?.shadowRoot) return false;
      const img = hostEl.shadowRoot.querySelector('img');
      if (!img) return false;
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }
      return img.naturalWidth > 0 && img.naturalHeight > 0;
    }, { timeout: 15000 });

    expect(await imageLoaded.jsonValue()).toBe(true);
  }

  /** icon 使用 chrome-extension:// 协议路径。 */
  async expectIconUsesExtensionUrl(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('basic-form.html');

    const srcHandle = await fixture.page.waitForFunction(() => {
      const hostEl = document.getElementById('browserhelm-floating-entry-host');
      if (!hostEl?.shadowRoot) return false;
      const img = hostEl.shadowRoot.querySelector('img');
      return img?.getAttribute('src') ?? false;
    }, { timeout: 15000 });
    const src = await srcHandle.jsonValue();

    expect(src).toBeTruthy();
    expect(src).toMatch(/^chrome-extension:\/\//);
    expect(src).toContain('icons/icon-16.png');
  }

  /** floating host 只在 top frame 创建（content script allFrames: true 时）。 */
  async expectOnlyTopFrameCreatesHost(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('iframe-form-host.html');
    await waitForFloatingButton(fixture.page);

    // top frame 中 floating host 存在
    const hostInTop = await fixture.page.evaluate(() => {
      return document.getElementById('browserhelm-floating-entry-host') !== null;
    });
    expect(hostInTop).toBe(true);

    // iframe 中不应有 floating host
    const frameLocator = fixture.page.frameLocator('iframe');
    // iframe 内容也许有 content script 注入（allFrames: true），但 floating panel 只在 top 创建
    const hasHostInFrame = await frameLocator.locator('#browserhelm-floating-entry-host').count();
    // 在 iframe 内不应创建 floating host（因为 window.top !== window）
    expect(hasHostInFrame).toBe(0);
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

async function waitForFloatingButton(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const hostEl = document.getElementById('browserhelm-floating-entry-host');
    return Boolean(hostEl?.shadowRoot?.querySelector('.entryButton'));
  }, { timeout: 15000 });
}

async function clickFloatingButton(page: Page): Promise<void> {
  await waitForFloatingButton(page);
  await page.evaluate(() => {
    const hostEl = document.getElementById('browserhelm-floating-entry-host');
    const button = hostEl?.shadowRoot?.querySelector('.entryButton');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Floating entry button not found');
    }
    button.click();
  });
}
