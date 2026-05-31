import type { ContentRpcResponse } from './content-rpc.schema';

type ScrollAmount = 'half' | 'page' | 'end' | { pixels: number };

export function readViewportInfo(document: Document) {
  const view = document.defaultView;
  const element = document.scrollingElement ?? document.documentElement;
  const scrollX = view?.scrollX ?? element.scrollLeft;
  const scrollY = view?.scrollY ?? element.scrollTop;
  const viewportWidth = view?.innerWidth ?? element.clientWidth;
  const viewportHeight = view?.innerHeight ?? element.clientHeight;
  const scrollWidth = element.scrollWidth;
  const scrollHeight = element.scrollHeight;
  return {
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
    scrollWidth,
    scrollHeight,
    canScrollDown: scrollY + viewportHeight < scrollHeight - 1,
    canScrollUp: scrollY > 0,
    canScrollLeft: scrollX > 0,
    canScrollRight: scrollX + viewportWidth < scrollWidth - 1,
    atBottom: scrollY + viewportHeight >= scrollHeight - 1,
    atTop: scrollY <= 0
  };
}

export function scrollViewport(document: Document, direction: string, amount: ScrollAmount): void {
  const view = document.defaultView;
  const element = document.scrollingElement ?? document.documentElement;
  const viewport = readViewportInfo(document);
  const pixels = scrollPixels(amount, viewport.viewportHeight);
  const left = direction === 'left' ? -pixels : direction === 'right' ? pixels : 0;
  const top = direction === 'up' ? -pixels : direction === 'down' ? pixels : 0;
  if (view) {
    view.scrollBy({ left, top, behavior: 'auto' });
    return;
  }
  element.scrollLeft += left;
  element.scrollTop += top;
}

export async function waitUntilStable(document: Document, quietMs: number): Promise<ContentRpcResponse> {
  const startedAt = Date.now();
  await waitForQuietDom(document, quietMs);
  const layoutStableFrames = await waitForStableLayoutFrames(document, 2);
  const fontsReady = await waitForFonts(document);
  return {
    ok: true,
    stable: true,
    readyState: document.readyState,
    layoutStableFrames,
    fontsReady,
    networkIdle: 'unavailable',
    waitedMs: Date.now() - startedAt
  };
}

function scrollPixels(amount: ScrollAmount, viewportHeight: number): number {
  if (typeof amount === 'object') {
    return amount.pixels;
  }
  if (amount === 'half') {
    return Math.round(viewportHeight / 2);
  }
  if (amount === 'page') {
    return viewportHeight;
  }
  return Number.MAX_SAFE_INTEGER;
}

function waitForQuietDom(document: Document, quietMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer) {
        clearTimeout(timer);
      }
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(finish, quietMs);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    timer = setTimeout(finish, quietMs);
  });
}

async function waitForStableLayoutFrames(document: Document, targetFrames: number): Promise<number> {
  let stableFrames = 0;
  let previous = layoutSignature(document);
  for (let index = 0; index < targetFrames * 3 && stableFrames < targetFrames; index += 1) {
    await nextAnimationFrame(document);
    const current = layoutSignature(document);
    if (current === previous) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      previous = current;
    }
  }
  return stableFrames;
}

function layoutSignature(document: Document): string {
  const element = document.scrollingElement ?? document.documentElement;
  const bodyRect = document.body?.getBoundingClientRect();
  return [
    element.scrollWidth,
    element.scrollHeight,
    element.clientWidth,
    element.clientHeight,
    bodyRect ? Math.round(bodyRect.width) : 0,
    bodyRect ? Math.round(bodyRect.height) : 0
  ].join(':');
}

function nextAnimationFrame(document: Document): Promise<void> {
  const view = document.defaultView;
  return new Promise((resolve) => {
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function waitForFonts(document: Document): Promise<boolean> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (typeof fonts?.ready?.then !== 'function') {
    return false;
  }
  await Promise.race([
    fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 250))
  ]);
  return true;
}
