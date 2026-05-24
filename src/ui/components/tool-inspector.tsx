import type { RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { formatToolResultFlags, jsonPreview } from '../lib/format-tool';

type ToolInspectorProps = {
  toolResult?: RuntimeToolResultSnapshot | undefined;
  argsPreview?: unknown;
};

export function ToolInspector({ toolResult, argsPreview }: ToolInspectorProps) {
  return (
    <section className="bh-toolInspector">
      <h2>工具结果</h2>
      {toolResult ? (
        <article className={`bh-toolResultCard ${toolResult.ok ? 'is-success' : 'is-danger'}`}>
          <header>
            <h3>{toolResult.tool}</h3>
            <span>{toolResult.ok ? '执行成功' : '执行失败'}</span>
          </header>
          <p className="bh-toolCode">{toolResult.code}</p>
          <p>{toolResult.summary}</p>
          <ul className="bh-chipList">
            {formatToolResultFlags(toolResult).map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <details>
            <summary>查看详情</summary>
            <pre>{jsonPreview({
              argsPreview: argsPreview ?? {},
              result: toolResult.detail ?? {}
            })}</pre>
          </details>
        </article>
      ) : (
        <p>暂无工具结果</p>
      )}
    </section>
  );
}
