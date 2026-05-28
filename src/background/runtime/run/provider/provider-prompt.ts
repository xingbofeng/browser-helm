import type { RunSnapshot } from '../../../../runtime/runtime-messages';
import { redactTextForModelContext } from '../../../../shared/redaction';
import type { Locale } from '../../../../i18n/types';
import { t } from '../../../../i18n/t';

export function providerPrompt(task: string, snapshot: RunSnapshot, locale: Locale): string {
  const observation = snapshot.observation;
  const untrustedPageContent = [
    observation?.visibleTextSummary
      ? `${t('provider.prompt.pageSummary', locale)}${redactTextForModelContext(observation.visibleTextSummary)}`
      : undefined,
    observation?.pageStateSummary
      ? `${t('provider.prompt.pageState', locale)}${redactTextForModelContext(observation.pageStateSummary)}`
      : undefined,
    snapshot.structuredPageData?.forms.summary
      ? `${t('provider.prompt.formSummary', locale)}${redactTextForModelContext(snapshot.structuredPageData.forms.summary)}`
      : undefined,
    snapshot.structuredPageData?.interactive.summary
      ? `${t('provider.prompt.interactiveSummary', locale)}${redactTextForModelContext(snapshot.structuredPageData.interactive.summary)}`
      : undefined,
    longPageText(snapshot)
      ? `${t('provider.prompt.longPageText', locale)}\n${redactTextForModelContext(longPageText(snapshot) ?? '')}`
      : undefined
  ].filter(Boolean);
  const summary = [
    `${t('provider.prompt.userTask', locale)}${redactTextForModelContext(task)}`,
    observation
      ? t('provider.prompt.currentPage', locale, { title: observation.title, source: providerPageSource(observation) })
      : t('provider.prompt.noPageSummary', locale),
    typeof observation?.interactiveCount === 'number'
      ? t('provider.prompt.interactiveCount', locale, { count: String(observation.interactiveCount) })
      : undefined,
    untrustedPageContent.length > 0
      ? [
          t('provider.prompt.untrustedContentPrefix', locale),
          ...untrustedPageContent,
          t('provider.prompt.untrustedContentSuffix', locale)
        ].join('\n')
      : undefined,
    snapshot.toolResult
      ? t('provider.prompt.toolResult', locale, {
          tool: snapshot.toolResult.tool,
          status: snapshot.toolResult.ok ? t('provider.prompt.success', locale) : t('provider.prompt.failure', locale),
          summary: redactTextForModelContext(snapshot.toolResult.summary)
        })
      : undefined,
  ].filter(Boolean).join('\n');
  return `${summary}\n\n${t('provider.prompt.instruction', locale)}`;
}

export function providerLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./u, '');
  } catch {
    return 'openai-compatible';
  }
}

function providerPageSource(observation: NonNullable<RunSnapshot['observation']>): string {
  if (observation.currentDomain) {
    return observation.currentDomain;
  }
  try {
    return new URL(observation.url).hostname.replace(/^www\./u, '');
  } catch {
    return observation.origin || 'unknown';
  }
}

function longPageText(snapshot: RunSnapshot): string | undefined {
  if (snapshot.toolResult?.tool !== 'bh_page_read_article' || !snapshot.toolResult.ok) {
    return undefined;
  }
  const detail = snapshot.toolResult.detail;
  if (!detail || typeof detail !== 'object') {
    return undefined;
  }
  const data = (detail as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const text = (data as { text?: unknown }).text;
  return typeof text === 'string' && text.trim() ? text.slice(0, 36_000) : undefined;
}
