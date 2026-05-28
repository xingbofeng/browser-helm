import type { ReactNode } from 'react';
import type { TranslationKey } from '../../i18n/types';
import { useT } from '../../i18n/context';
import type { TabDataStatus } from '../../shared/schemas/structured-page-data.schema';

type TabDataStatusProps = {
  status: TabDataStatus;
  summary: string;
  count: number;
  children: ReactNode;
};

const TAB_DATA_STATUS_KEY = {
  ready: 'tabData.status.ready',
  empty: 'tabData.status.empty',
  partial: 'tabData.status.partial',
  error: 'tabData.status.error',
  unsupported: 'tabData.status.unsupported',
} as const satisfies Record<TabDataStatus, TranslationKey>;

export function TabDataStatusBlock(props: TabDataStatusProps) {
  const t = useT();
  return (
    <section className={`bh-tabData bh-tabData-${props.status}`}>
      <header className="bh-tabDataHeader">
        <span className={`bh-statusPill bh-statusPill-${props.status}`}>
          {t(TAB_DATA_STATUS_KEY[props.status])}
        </span>
        <span className="bh-countBadge">{t('tabData.count', { count: String(props.count) })}</span>
      </header>
      <p className="bh-tabSummary">{props.summary}</p>
      {props.children}
    </section>
  );
}

export function renderWarnings(warnings: Array<string | { message: string }>) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <ul className="bh-warnings">
      {warnings.map((warning, index) => (
        <li key={index}>{typeof warning === 'string' ? warning : warning.message}</li>
      ))}
    </ul>
  );
}
