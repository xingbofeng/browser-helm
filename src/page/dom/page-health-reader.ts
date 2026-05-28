import type {
  ConsoleErrorSummary,
  ConsoleMessageSummary,
  NetworkFailureSummary,
  PageHealthSummary
} from '../../shared/schemas/page-health.schema';
import { pageHealthSummarySchema } from '../../shared/schemas/page-health.schema';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';

type RawConsoleError = {
  message?: unknown;
  source?: unknown;
};

type RawConsoleMessage = {
  level?: unknown;
  message?: unknown;
  source?: unknown;
};

type RawNetworkFailure = {
  url?: unknown;
  method?: unknown;
  errorText?: unknown;
  status?: unknown;
};

export function readPageHealthSummary(doc: Document, locale: Locale = 'zh'): PageHealthSummary {
  const consoleErrors = summarizeConsoleErrors(readWindowArray('__browserHelmConsoleErrors'));
  const consoleMessages = summarizeConsoleMessages(
    readWindowArray('__browserHelmConsoleMessages')
  );
  const networkFailures = summarizeNetworkFailures(
    readWindowArray('__browserHelmNetworkFailures')
  );
  const hasForm = doc.querySelector('form,input,textarea,select') !== null;
  const issueCount = consoleErrors.length + networkFailures.length;

  return pageHealthSummarySchema.parse({
    consoleErrors,
    consoleMessages,
    networkFailures,
    hasForm,
    pageStateSummary:
      issueCount > 0
        ? t('dom.pageHealth.issuesFound', locale, {
            errorCount: String(consoleErrors.length),
            messageCount: String(consoleMessages.length),
            failureCount: String(networkFailures.length)
          })
        : t('dom.pageHealth.noIssuesFound', locale),
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

function summarizeConsoleMessages(rawMessages: unknown[]): ConsoleMessageSummary[] {
  const counts = new Map<string, ConsoleMessageSummary>();
  for (const raw of rawMessages) {
    const message = raw as RawConsoleMessage;
    if (
      !isConsoleMessageLevel(message.level) ||
      typeof message.message !== 'string' ||
      message.message.length === 0
    ) {
      continue;
    }
    const source = typeof message.source === 'string' ? message.source : undefined;
    const key = `${message.level}\u0000${message.message}\u0000${source ?? ''}`;
    const current = counts.get(key);
    counts.set(key, {
      level: message.level,
      message: message.message,
      ...(source ? { source } : {}),
      count: (current?.count ?? 0) + 1
    });
  }
  return Array.from(counts.values());
}

function isConsoleMessageLevel(value: unknown): value is ConsoleMessageSummary['level'] {
  return value === 'debug' || value === 'info' || value === 'log' || value === 'warn';
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
