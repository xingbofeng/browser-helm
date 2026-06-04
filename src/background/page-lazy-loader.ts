export type LazyLoadScrollOptions = {
  maxScrolls?: number | undefined;
  scrollStepPx?: number | undefined;
  settleMs?: number | undefined;
  restoreScroll?: boolean | undefined;
};

type NormalizedLazyLoadScrollOptions = {
  maxScrolls: number;
  scrollStepPx: number;
  settleMs: number;
  restoreScroll: boolean;
};

export type LazyLoadScrollReport = {
  attempted: boolean;
  steps: number;
  initialScrollHeight: number;
  finalScrollHeight: number;
  restoredScrollX: number;
  restoredScrollY: number;
  reason?: string | undefined;
};

const DEFAULT_MAX_SCROLLS = 24;
const DEFAULT_SETTLE_MS = 180;

export async function warmPageForLazyMedia(
  tabId: number,
  options: LazyLoadScrollOptions = {}
): Promise<LazyLoadScrollReport> {
  const normalized = normalizeLazyLoadOptions(options);
  const executeScript = globalThis.chrome?.scripting && 'executeScript' in globalThis.chrome.scripting
    ? globalThis.chrome.scripting.executeScript
    : undefined;
  if (typeof executeScript === 'function') {
    try {
      const [result] = await executeScript({
        target: { tabId },
        args: [normalized],
        func: lazyScrollPageForMedia
      });
      return parseLazyLoadReport(result?.result);
    } catch (error) {
      return warmPageForLazyMediaWithDebugger(tabId, normalized, error);
    }
  }
  return warmPageForLazyMediaWithDebugger(tabId, normalized);
}

function normalizeLazyLoadOptions(options: LazyLoadScrollOptions): NormalizedLazyLoadScrollOptions {
  return {
    maxScrolls: clampInteger(options.maxScrolls, 1, 80, DEFAULT_MAX_SCROLLS),
    scrollStepPx: clampInteger(options.scrollStepPx, 160, 4000, 0),
    settleMs: clampInteger(options.settleMs, 0, 2000, DEFAULT_SETTLE_MS),
    restoreScroll: options.restoreScroll !== false
  };
}

async function warmPageForLazyMediaWithDebugger(
  tabId: number,
  options: NormalizedLazyLoadScrollOptions,
  scriptingError?: unknown
): Promise<LazyLoadScrollReport> {
  const debuggerManager = await import('./debugger/debugger-manager');
  try {
    const result = await debuggerManager.defaultDebuggerManager.evaluate(
      tabId,
      `(${lazyScrollPageForMedia.toString()})(${JSON.stringify(options)})`,
      { awaitPromise: true }
    );
    const remoteObject = result.result;
    const value = typeof remoteObject === 'object' && remoteObject !== null
      ? (remoteObject as Record<string, unknown>).value
      : undefined;
    return parseLazyLoadReport(value);
  } catch (error) {
    return {
      attempted: false,
      steps: 0,
      initialScrollHeight: 0,
      finalScrollHeight: 0,
      restoredScrollX: 0,
      restoredScrollY: 0,
      reason: normalizeWarmupError(scriptingError ?? error)
    };
  }
}

function parseLazyLoadReport(value: unknown): LazyLoadScrollReport {
  if (!isRecord(value)) {
    return {
      attempted: false,
      steps: 0,
      initialScrollHeight: 0,
      finalScrollHeight: 0,
      restoredScrollX: 0,
      restoredScrollY: 0,
      reason: 'lazy_load_scroll_result_unavailable'
    };
  }
  return {
    attempted: value.attempted === true,
    steps: nonNegativeInteger(value.steps),
    initialScrollHeight: nonNegativeNumber(value.initialScrollHeight),
    finalScrollHeight: nonNegativeNumber(value.finalScrollHeight),
    restoredScrollX: finiteNumber(value.restoredScrollX),
    restoredScrollY: finiteNumber(value.restoredScrollY),
    ...(typeof value.reason === 'string' && value.reason.length > 0 ? { reason: value.reason } : {})
  };
}

function normalizeWarmupError(error: unknown): string {
  return error instanceof Error ? error.message : 'lazy_load_scroll_unavailable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function lazyScrollPageForMedia(options: NormalizedLazyLoadScrollOptions): Promise<LazyLoadScrollReport> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const initialScrollHeight = Math.max(
    scrollingElement.scrollHeight,
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const stepPx = options.scrollStepPx > 0
    ? options.scrollStepPx
    : Math.max(240, Math.floor(viewportHeight * 0.85));
  let steps = 0;
  let previousScrollHeight = initialScrollHeight;
  let stableBottomPasses = 0;

  try {
    for (let index = 0; index < options.maxScrolls; index += 1) {
      const scrollHeight = Math.max(
        scrollingElement.scrollHeight,
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      const maxY = Math.max(0, scrollHeight - viewportHeight);
      const nextY = Math.min(maxY, Math.max(window.scrollY + stepPx, index === 0 ? stepPx : window.scrollY));
      window.scrollTo(0, nextY);
      steps += 1;
      if (options.settleMs > 0) {
        await wait(options.settleMs);
      }
      const nextScrollHeight = Math.max(
        scrollingElement.scrollHeight,
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      const atBottom = Math.abs(window.scrollY - Math.max(0, nextScrollHeight - viewportHeight)) <= 4;
      stableBottomPasses = atBottom && Math.abs(nextScrollHeight - previousScrollHeight) <= 1
        ? stableBottomPasses + 1
        : 0;
      previousScrollHeight = nextScrollHeight;
      if (stableBottomPasses >= 2) {
        break;
      }
    }
  } finally {
    if (options.restoreScroll) {
      window.scrollTo(originalX, originalY);
      if (options.settleMs > 0) {
        await wait(Math.min(80, options.settleMs));
      }
    }
  }

  return {
    attempted: true,
    steps,
    initialScrollHeight,
    finalScrollHeight: Math.max(
      scrollingElement.scrollHeight,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    ),
    restoredScrollX: options.restoreScroll ? originalX : window.scrollX,
    restoredScrollY: options.restoreScroll ? originalY : window.scrollY
  };
}
