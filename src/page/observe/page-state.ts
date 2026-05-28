import { findInteractiveCandidates } from '../a11y/element-finder';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';

export type PageState = {
  interactiveCount: number;
  pageStateSummary: string;
  emptyReason?: string;
};

export function readPageState(document: Document, locale: Locale = 'zh'): PageState {
  const interactiveCount = findInteractiveCandidates(document).length;
  if (interactiveCount === 0) {
    return {
      interactiveCount,
      pageStateSummary: t('page.state.noInteractiveElements', locale),
      emptyReason: 'NO_INTERACTIVE_ELEMENTS'
    };
  }

  return {
    interactiveCount,
    pageStateSummary: t('page.state.interactiveCount', locale, { count: String(interactiveCount) })
  };
}
