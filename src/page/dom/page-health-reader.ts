import type {
  ConsoleErrorSummary,
  NetworkFailureSummary,
  PageHealthSummary
} from '../../shared/schemas/page-health.schema';
import { pageHealthSummarySchema } from '../../shared/schemas/page-health.schema';

type RawConsoleError = {
  message?: unknown;
  source?: unknown;
};

type RawNetworkFailure = {
  url?: unknown;
  method?: unknown;
  errorText?: unknown;
  status?: unknown;
};

export function readPageHealthSummary(doc: Document): PageHealthSummary {
  const consoleErrors = summarizeConsoleErrors(readWindowArray('__browserHelmConsoleErrors'));
  const networkFailures = summarizeNetworkFailures(
    readWindowArray('__browserHelmNetworkFailures')
  );
  const hasForm = doc.querySelector('form,input,textarea,select') !== null;
  const issueCount = consoleErrors.length + networkFailures.length;

  return pageHealthSummarySchema.parse({
    consoleErrors,
    networkFailures,
    hasForm,
    pageStateSummary:
      issueCount > 0
        ? `检测到 ${consoleErrors.length} 类 console error 和 ${networkFailures.length} 个 network failure`
        : '未发现明显页面异常',
    limitations: ['CDP deep inspection is not available in this mode']
  });
}

function readWindowArray(key: string): unknown[] {
  const value = (globalThis.window as unknown as Record<string, unknown> | undefined)?.[
    key
  ];
  return Array.isArray(value) ? value : [];
}

function summarizeConsoleErrors(rawErrors: unknown[]): ConsoleErrorSummary[] {
  const counts = new Map<string, ConsoleErrorSummary>();
  for (const raw of rawErrors) {
    const error = raw as RawConsoleError;
    if (typeof error.message !== 'string' || error.message.length === 0) {
      continue;
    }
    const source = typeof error.source === 'string' ? error.source : undefined;
    const key = `${error.message}\u0000${source ?? ''}`;
    const current = counts.get(key);
    counts.set(key, {
      message: error.message,
      ...(source ? { source } : {}),
      count: (current?.count ?? 0) + 1
    });
  }
  return Array.from(counts.values());
}

function summarizeNetworkFailures(rawFailures: unknown[]): NetworkFailureSummary[] {
  return rawFailures.flatMap((raw) => {
    const failure = raw as RawNetworkFailure;
    if (
      typeof failure.url !== 'string' ||
      typeof failure.method !== 'string' ||
      typeof failure.errorText !== 'string'
    ) {
      return [];
    }
    return [
      {
        url: failure.url,
        method: failure.method,
        errorText: failure.errorText,
        ...(typeof failure.status === 'number' ? { status: failure.status } : {})
      }
    ];
  });
}
