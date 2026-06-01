import { Save } from 'lucide-react';

import { useT } from '../../i18n/context';
import type { WorkflowDraft } from '../../shared/schemas/workflow';

type WorkflowDraftPreviewProps = {
  draft: WorkflowDraft;
  onSave: () => void;
};

export function WorkflowDraftPreview({ draft, onSave }: WorkflowDraftPreviewProps) {
  const t = useT();
  return (
    <section className="bh-replayPreview bh-workflowDraft" aria-label={t('workflow.draft.title')}>
      <header className="bh-replayHeader">
        <div>
          <h2>{t('workflow.draft.title')}</h2>
          <p>{draft.intent}</p>
        </div>
        <span className="bh-replayRisk">{t('workflow.draft.unsaved')}</span>
      </header>
      <ol className="bh-replaySteps">
        {draft.steps.map((step, index) => (
          <li key={step.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.tool}</strong>
              <p>{step.summary}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="bh-replayActions">
        <button type="button" onClick={onSave}>
          <Save size={13} aria-hidden="true" />
          {t('workflow.draft.saveForPreview')}
        </button>
      </footer>
    </section>
  );
}
