import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type InteractiveElementsTabProps = {
  data: StructuredPageData['interactive'];
};

export function InteractiveElementsTab({ data }: InteractiveElementsTabProps) {
  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <input aria-label="筛选交互元素" placeholder="Filter interactive elements" readOnly />
      <ul>
        {data.items.map((item) => (
          <li key={item.refId}>
            <code>{item.refId}</code> {item.role ?? '-'} {item.name ?? '-'} {item.tagName}{' '}
            visible={String(item.visible)} disabled={String(item.disabled)}
            {item.checked !== undefined ? ` checked=${String(item.checked)}` : ''}
            {item.selected !== undefined ? ` selected=${String(item.selected)}` : ''}
          </li>
        ))}
      </ul>
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
