import { Trash2 } from 'lucide-react';

import { useT } from '../../i18n/context';
import type { MemoryEntry } from '../../shared/schemas/memory';

type MemoryViewerProps = {
  domain?: string | undefined;
  entries: MemoryEntry[];
  loading?: boolean | undefined;
  onDelete: (id: string) => void;
  onClearDomain: () => void;
  onClearAll: () => void;
};

export function MemoryViewer({
  domain,
  entries,
  loading = false,
  onDelete,
  onClearDomain,
  onClearAll
}: MemoryViewerProps) {
  const t = useT();
  return (
    <section className="bh-memoryViewer" aria-label={t('memory.viewer.title')}>
      <header className="bh-memoryHeader">
        <div>
          <h2>{t('memory.viewer.title')}</h2>
          <p>{domain ? t('memory.viewer.domain', { domain }) : t('memory.viewer.noDomain')}</p>
        </div>
        <div className="bh-memoryActions">
          <button
            type="button"
            className="bh-memoryAction"
            disabled={!domain || entries.length === 0 || loading}
            onClick={onClearDomain}
            aria-label={t('memory.viewer.clearDomainAria')}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="bh-memoryAction"
            disabled={entries.length === 0 || loading}
            onClick={onClearAll}
            aria-label={t('memory.viewer.clearAllAria')}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      {entries.length ? (
        <ul className="bh-memoryList">
          {entries.map((entry) => (
            <li key={entry.id} className="bh-memoryItem">
              <div>
                <strong>{entry.task}</strong>
                <p>{entry.summary}</p>
                <span>
                  {t('memory.viewer.score', {
                    success: String(entry.successCount),
                    failed: String(entry.failureCount)
                  })}
                </span>
              </div>
              <button
                type="button"
                className="bh-memoryAction"
                onClick={() => onDelete(entry.id)}
                aria-label={t('memory.viewer.deleteAria')}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bh-emptyState">
          {loading ? t('memory.viewer.loading') : t('memory.viewer.empty')}
        </p>
      )}
    </section>
  );
}
