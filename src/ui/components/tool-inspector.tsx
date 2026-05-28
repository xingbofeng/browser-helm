import type { RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { useT } from '../../i18n/context';
import { formatToolResultFlags, redactPreview } from '../lib/format-tool';
import { StructuredPayload } from './structured-payload';

type ToolInspectorProps = {
  toolResult?: RuntimeToolResultSnapshot | undefined;
  argsPreview?: unknown;
};

export function ToolInspector({ toolResult, argsPreview }: ToolInspectorProps) {
  const t = useT();
  return (
    <section className="bh-toolInspector">
      {toolResult ? (
        <article className={`bh-toolResultCard ${toolResult.ok ? 'is-success' : 'is-danger'}`}>
          <header>
            <div>
              <h3>{toolResult.tool}</h3>
              <p className="bh-toolCode">{toolResult.code}</p>
            </div>
            <span className="bh-toolStatus">{toolResult.ok ? t('tool.inspector.success') : t('tool.inspector.failed')}</span>
          </header>
          <p className="bh-toolSummary">{toolResult.summary}</p>
          <ul className="bh-chipList">
            {formatToolResultFlags(toolResult).map((flag) => (
              <li key={flag}>{t(flag)}</li>
            ))}
          </ul>
          <details>
            <summary>{t('tool.inspector.viewDetails')}</summary>
            <StructuredPayload value={{
              argsPreview: redactPreview(argsPreview ?? {}),
              result: redactPreview(toolResult.detail ?? {})
            }} />
          </details>
        </article>
      ) : (
        <p className="bh-emptyState">{t('tool.inspector.empty')}</p>
      )}
    </section>
  );
}
