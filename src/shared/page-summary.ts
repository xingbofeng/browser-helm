import { t } from '../i18n/t';
import type { Locale } from '../i18n/types';

type PageSummaryInput = {
  title?: string | undefined;
  currentDomain?: string | undefined;
  url?: string | undefined;
  pageStateSummary?: string | undefined;
  interactiveCount?: number | undefined;
  warnings?: string[] | undefined;
};

export function buildUserFacingPageSummary(input: PageSummaryInput, locale: Locale): string {
  const title = cleanSummaryPart(input.title);
  const domain = cleanSummaryPart(input.currentDomain) ?? domainFromUrl(input.url);
  const state = cleanSummaryPart(input.pageStateSummary);
  const interactiveUnit = t('page.summary.interactiveUnit', locale);
  const shouldShowInteractiveCount = typeof input.interactiveCount === 'number' &&
    !state?.includes(interactiveUnit);
  const lines = [
    title
      ? t('page.summary.pageLooksLike', locale, { title })
      : t('page.observation.readonlyDone', locale),
    domain ? t('page.summary.source', locale, { domain }) : undefined,
    state,
    shouldShowInteractiveCount
      ? t('page.summary.interactiveCount', locale, { count: String(input.interactiveCount) })
      : undefined,
    input.warnings?.length
      ? t('page.summary.warnings', locale, {
        warnings: input.warnings.map(cleanSummaryPart).filter(Boolean).join('；')
      })
      : undefined
  ];
  return lines.filter(Boolean).join('\n');
}

function cleanSummaryPart(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/gu, ' ').trim();
  return trimmed || undefined;
}

function domainFromUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.hostname.replace(/^www\./u, '');
  } catch {
    return undefined;
  }
}
