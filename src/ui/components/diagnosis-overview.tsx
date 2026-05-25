import type { RunSnapshot } from '../../runtime/runtime-messages';

type DiagnosisOverviewProps = {
  snapshot: RunSnapshot | undefined;
};

export function DiagnosisOverview({ snapshot }: DiagnosisOverviewProps) {
  if (!snapshot) {
    return null;
  }
  const planSteps = snapshot.plan?.steps ?? [];
  const findings = snapshot.findings ?? snapshot.debugReport?.findings ?? [];
  const limitations = [
    ...(snapshot.capabilityLimitations ?? []),
    ...(snapshot.debugReport?.limitations ?? [])
  ];

  return (
    <section className="bh-diagnosisOverview" aria-label="Diagnosis overview">
      <h2>诊断概览</h2>
      {snapshot.modeReason ? <p>{snapshot.modeReason}</p> : null}
      {snapshot.debugReport?.title ? <p>{snapshot.debugReport.title}</p> : null}
      {snapshot.canInterrupt || snapshot.canReviseGoal ? (
        <p>
          {snapshot.canInterrupt ? '可中断' : null}
          {snapshot.canInterrupt && snapshot.canReviseGoal ? ' / ' : null}
          {snapshot.canReviseGoal ? '可修改目标' : null}
        </p>
      ) : null}
      {planSteps.length > 0 ? (
        <ol>
          {planSteps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <span>{step.title}</span>
              <strong>{step.status}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {findings.length > 0 ? (
        <ul>
          {findings.map((finding) => (
            <li key={`${finding.title}:${finding.confidence}`}>
              <strong>{finding.title}</strong>
              <span>{finding.confidence}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {limitations.length > 0 ? (
        <p>{limitations.join('；')}</p>
      ) : null}
    </section>
  );
}
