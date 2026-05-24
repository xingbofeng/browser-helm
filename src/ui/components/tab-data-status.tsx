import type { ReactNode } from 'react';

import type { TabDataStatus } from '../../shared/schemas/structured-page-data.schema';

type TabDataStatusProps = {
  status: TabDataStatus;
  summary: string;
  count: number;
  children: ReactNode;
};

export function TabDataStatusBlock(props: TabDataStatusProps) {
  return (
    <section className={`bh-tabData bh-tabData-${props.status}`}>
      <header className="bh-tabDataHeader">
        <span className={`bh-statusPill bh-statusPill-${props.status}`}>
          {statusLabels[props.status]}
        </span>
        <span className="bh-countBadge">{props.count} 项</span>
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

const statusLabels: Record<TabDataStatus, string> = {
  ready: '已就绪',
  empty: '等待数据',
  partial: '部分可用',
  error: '读取失败',
  unsupported: '暂不支持'
};
