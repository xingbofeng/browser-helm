import type { RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { formatToolResultFlags, redactPreview } from '../lib/format-tool';
import { StructuredPayload } from './structured-payload';

type ToolInspectorProps = {
  toolResult?: RuntimeToolResultSnapshot | undefined;
  argsPreview?: unknown;
};

export function ToolInspector({ toolResult, argsPreview }: ToolInspectorProps) {
  return (
    <section className="bh-toolInspector">
      {toolResult ? (
        <article className={`bh-toolResultCard ${toolResult.ok ? 'is-success' : 'is-danger'}`}>
          <header>
            <div>
              <h3>{toolResult.tool}</h3>
              <p className="bh-toolCode">{toolResult.code}</p>
            </div>
            <span className="bh-toolStatus">{toolResult.ok ? '执行成功' : '执行失败'}</span>
          </header>
          <p className="bh-toolSummary">{toolResult.summary}</p>
          <ul className="bh-chipList">
            {formatToolResultFlags(toolResult).map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <details>
            <summary>查看详情</summary>
            <StructuredPayload value={{
              argsPreview: redactPreview(argsPreview ?? {}),
              result: redactPreview(toolResult.detail ?? {})
            }} />
          </details>
        </article>
      ) : (
        <p className="bh-emptyState">暂无工具结果</p>
      )}
    </section>
  );
}
