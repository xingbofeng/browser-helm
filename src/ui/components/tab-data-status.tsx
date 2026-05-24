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
      <header>
        <strong>{props.status}</strong>
        <span>count={props.count}</span>
      </header>
      <p>{props.summary}</p>
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
