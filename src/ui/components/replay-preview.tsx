import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { useT } from '../../i18n/context';
import type { WorkflowReplayPreview } from '../../shared/schemas/workflow';

type ReplayPreviewProps = {
  preview: WorkflowReplayPreview;
  onApprove: () => void;
  onDeny: () => void;
};

export function ReplayPreview({ preview, onApprove, onDeny }: ReplayPreviewProps) {
  const t = useT();
  return (
    <section className={`bh-replayPreview${preview.highRisk ? ' is-danger' : ''}`} aria-label={t('replay.preview.title')}>
      <header className="bh-replayHeader">
        <div>
          <h2>{t('replay.preview.title')}</h2>
          <p>{preview.intent}</p>
        </div>
        <span className="bh-replayRisk">
          {preview.highRisk ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
          {preview.highRisk ? t('replay.preview.highRisk') : t('replay.preview.lowRisk')}
        </span>
      </header>
      <ol className="bh-replaySteps">
        {preview.steps.map((step, index) => (
          <li key={step.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.tool}</strong>
              <p>{step.summary}</p>
            </div>
          </li>
        ))}
      </ol>
      {preview.warnings.length ? (
        <ul className="bh-replayWarnings">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <footer className="bh-replayActions">
        <button type="button" onClick={onDeny}>{t('replay.preview.deny')}</button>
        <button type="button" onClick={onApprove}>{t('replay.preview.approve')}</button>
      </footer>
    </section>
  );
}

