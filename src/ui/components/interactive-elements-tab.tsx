import { useMemo, useState } from 'react';

import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type InteractiveElementsTabProps = {
  data: StructuredPageData['interactive'];
};

export function InteractiveElementsTab({ data }: InteractiveElementsTabProps) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('全部');
  const roleFilters = useMemo(() => {
    const roles = Array.from(new Set(data.items.map((item) => item.role ?? item.tagName)));
    return ['全部', ...roles.slice(0, 5), '禁用'];
  }, [data.items]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.items.filter((item) => {
      const roleMatched =
        roleFilter === '全部' ||
        (roleFilter === '禁用' ? item.disabled : (item.role ?? item.tagName) === roleFilter);
      if (!roleMatched) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return [item.refId, item.role, item.name, item.tagName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalized);
    });
  }, [data.items, query, roleFilter]);
  const selectedItem = filteredItems[0];

  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <div className="bh-filterBar">
        <input
          aria-label="筛选交互元素"
          placeholder="筛选角色、名称或 ref"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <div className="bh-chipRow" aria-label="交互元素类型">
          {roleFilters.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={roleFilter === role}
              onClick={() => setRoleFilter(role)}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      <div className="bh-dataTableWrap">
        <table className="bh-dataTable">
          <thead>
            <tr>
              <th>角色</th>
              <th>名称</th>
              <th>标签</th>
              <th>状态</th>
              <th>ref_id</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.refId} className={item.refId === selectedItem?.refId ? 'is-selected' : undefined}>
                <td>{item.role ?? '-'}</td>
                <td>
                  <strong>{item.name ?? '-'}</strong>
                  <span>
                    {item.checked !== undefined ? `checked=${String(item.checked)}` : ''}
                    {item.selected !== undefined ? ` selected=${String(item.selected)}` : ''}
                  </span>
                </td>
                <td>{item.tagName}</td>
                <td>
                  <span className={`bh-statePill ${item.disabled ? 'is-danger' : 'is-success'}`}>
                    {item.disabled ? '禁用' : '可用'}
                  </span>
                  <span className="bh-mutedState">visible={String(item.visible)}</span>
                </td>
                <td><code>{item.refId}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedItem ? (
        <article className="bh-detailPanel">
          <header>
            <h3>元素详情</h3>
            <code>{selectedItem.refId}</code>
          </header>
          <dl>
            <div>
              <dt>名称</dt>
              <dd>{selectedItem.name ?? '-'}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{selectedItem.role ?? selectedItem.tagName}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                visible={String(selectedItem.visible)} disabled={String(selectedItem.disabled)}
              </dd>
            </div>
          </dl>
        </article>
      ) : null}
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
