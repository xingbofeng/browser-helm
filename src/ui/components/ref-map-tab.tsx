import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type RefMapTabProps = {
  data: StructuredPageData['refs'];
};

export function RefMapTab({ data }: RefMapTabProps) {
  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <input aria-label="搜索 Ref" placeholder="Search refs" readOnly />
      <ul>
        {data.items.map((item) => (
          <li key={item.refId}>
            <code>{item.refId}</code> {item.role ?? '-'} {item.name ?? '-'} {item.tagName}{' '}
            visible={String(item.visible)} disabled={String(item.disabled)}
          </li>
        ))}
      </ul>
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
