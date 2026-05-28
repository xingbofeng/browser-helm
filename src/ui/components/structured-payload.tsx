import { useT } from '../../i18n/context';
import type { TranslationKey, TranslationParams } from '../../i18n/types';

type StructuredPayloadProps = {
  value: unknown;
  maxDepth?: number;
};

type TFunc = (key: TranslationKey, params?: TranslationParams) => string;

export function StructuredPayload({
  value,
  maxDepth = 4
}: StructuredPayloadProps) {
  const t = useT();
  return (
    <div className="bh-structuredPayload">
      <StructuredValue value={value} depth={0} maxDepth={maxDepth} t={t} />
    </div>
  );
}

function StructuredValue({
  value,
  depth,
  maxDepth,
  t,
}: {
  value: unknown;
  depth: number;
  maxDepth: number;
  t: TFunc;
}) {
  if (value === null || value === undefined) {
    return <span className="bh-payloadPrimitive is-muted">{String(value)}</span>;
  }
  if (typeof value === 'string') {
    return <span className="bh-payloadPrimitive">"{value}"</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="bh-payloadPrimitive">{String(value)}</span>;
  }
  if (depth >= maxDepth) {
    return <span className="bh-payloadPrimitive is-muted">{compactLabel(value, t)}</span>;
  }
  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length === 0) {
      return <span className="bh-payloadPrimitive is-muted">[]</span>;
    }
    return (
      <ol className="bh-payloadList">
        {items.slice(0, 12).map((item, index) => (
          <li key={index}>
            <span className="bh-payloadKey">[{index}]</span>
            <StructuredValue value={item} depth={depth + 1} maxDepth={maxDepth} t={t} />
          </li>
        ))}
        {items.length > 12 ? (
          <li>
            <span className="bh-payloadPrimitive is-muted">
              {t('payload.moreItems', { count: String(items.length - 12) })}
            </span>
          </li>
        ) : null}
      </ol>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="bh-payloadPrimitive is-muted">{'{}'}</span>;
    }
    return (
      <dl className="bh-payloadObject">
        {entries.slice(0, 16).map(([key, item]) => (
          <div key={key} className="bh-payloadRow">
            <dt>{key}</dt>
            <dd>
              <StructuredValue value={item} depth={depth + 1} maxDepth={maxDepth} t={t} />
            </dd>
          </div>
        ))}
        {entries.length > 16 ? (
          <div className="bh-payloadRow">
            <dt>...</dt>
            <dd>
              <span className="bh-payloadPrimitive is-muted">
                {t('payload.moreItems', { count: String(entries.length - 16) })}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    );
  }
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return <span className="bh-payloadPrimitive">{String(value)}</span>;
  }
  if (typeof value === 'function') {
    return <span className="bh-payloadPrimitive is-muted">[function]</span>;
  }
  return <span className="bh-payloadPrimitive is-muted">[unserializable]</span>;
}

function compactLabel(value: unknown, t: TFunc): string {
  if (Array.isArray(value)) {
    return t('payload.arrayCount', { count: String(value.length) });
  }
  if (typeof value === 'object' && value !== null) {
    return t('payload.objectCount', { count: String(Object.keys(value).length) });
  }
  return String(value);
}
