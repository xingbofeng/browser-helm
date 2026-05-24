type CockpitFooterProps = {
  runId?: string | undefined;
};

export function CockpitFooter({ runId }: CockpitFooterProps) {
  return (
    <footer className="bh-cockpitFooter" aria-label="Session metadata">
      <span className="bh-shellIcon" aria-hidden="true" />
      <span>
        会话 ID
        <strong>{runId ?? '未开始'}</strong>
      </span>
      <span className="bh-footerVersion">v0.4</span>
      <span className="bh-footerGear" aria-hidden="true" />
    </footer>
  );
}
