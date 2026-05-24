import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type PageObservationTabProps = {
  data: StructuredPageData['observation'];
};

export function PageObservationTab({ data }: PageObservationTabProps) {
  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      {data.items.map((item) => (
        <article key={item.url} className="bh-observationItem">
          <h3>{item.title || 'Untitled page'}</h3>
          <p>{item.url}</p>
          <p>{item.currentDomain}</p>
          <p>{item.visibleTextSummary}</p>
          <p>{item.pageStateSummary}</p>
        </article>
      ))}
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
