import { useMemo, useState } from 'react';

import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type RefMapTabProps = {
  data: StructuredPageData['refs'];
};

export function RefMapTab({ data }: RefMapTabProps) {
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return data.items;
    }
    return data.items.filter((item) =>
      [item.refId, item.role, item.name, item.tagName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [data.items, query]);
  const selectedItem = filteredItems[0];

  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <div className="bh-filterBar">
        <input
          aria-label="搜索 Ref"
          placeholder="搜索 ref、角色或名称"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div className="bh-dataTableWrap">
        <table className="bh-dataTable">
          <thead>
            <tr>
              <th>ref_id</th>
              <th>角色</th>
              <th>名称</th>
              <th>标签</th>
              <th>可见</th>
              <th>禁用</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.refId} className={item.refId === selectedItem?.refId ? 'is-selected' : undefined}>
                <td><code>{item.refId}</code></td>
                <td>{item.role ?? '-'}</td>
                <td><strong>{item.name ?? '-'}</strong></td>
                <td>{item.tagName}</td>
                <td>{String(item.visible)}</td>
                <td>{String(item.disabled ?? false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedItem ? (
        <article className="bh-detailPanel">
          <header>
            <h3>Ref 详情</h3>
            <code>{selectedItem.refId}</code>
          </header>
          <dl>
            <div>
              <dt>Accessible Name</dt>
              <dd>{selectedItem.name ?? '-'}</dd>
            </div>
            <div>
              <dt>Role / Tag</dt>
              <dd>
                {selectedItem.role ?? '-'} / {selectedItem.tagName}
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                visible={String(selectedItem.visible)} disabled={String(selectedItem.disabled ?? false)}
              </dd>
            </div>
          </dl>
        </article>
      ) : null}
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
