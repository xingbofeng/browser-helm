import type { RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { formatToolResultFlags, jsonPreview } from '../lib/format-tool';

type ToolInspectorProps = {
  toolResult?: RuntimeToolResultSnapshot | undefined;
  argsPreview?: unknown;
};

export function ToolInspector({ toolResult, argsPreview }: ToolInspectorProps) {
  return (
    <section className="bh-toolInspector">
      <h2>Tool Inspector</h2>
      {toolResult ? (
        <article>
          <h3>{toolResult.tool}</h3>
          <p>{toolResult.code}</p>
          <p>{toolResult.summary}</p>
          <ul>
            {formatToolResultFlags(toolResult).map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <pre>{jsonPreview(argsPreview ?? {})}</pre>
        </article>
      ) : (
        <p>暂无工具结果</p>
      )}
    </section>
  );
}
