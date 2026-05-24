import type { ReactNode } from 'react';

type CockpitShellProps = {
  header: ReactNode;
  task: ReactNode;
  tabs: ReactNode;
  timeline: ReactNode;
  inspector: ReactNode;
  approval?: ReactNode;
  settings?: ReactNode;
  footer?: ReactNode;
};

export function CockpitShell(props: CockpitShellProps) {
  return (
    <main className="bh-cockpitShell">
      <header className="bh-cockpitHeader">{props.header}</header>
      <section className="bh-cockpitTask">{props.task}</section>
      <section className="bh-cockpitTabs">{props.tabs}</section>
      <section className="bh-cockpitTimeline">{props.timeline}</section>
      <aside className="bh-cockpitInspector">{props.inspector}</aside>
      {props.approval ? <section className="bh-cockpitApproval">{props.approval}</section> : null}
      {props.settings ? <section className="bh-cockpitSettings">{props.settings}</section> : null}
      {props.footer ? <section className="bh-cockpitFooterSlot">{props.footer}</section> : null}
    </main>
  );
}
