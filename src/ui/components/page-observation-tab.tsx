import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type PageObservationTabProps = {
  data: StructuredPageData['observation'];
};

export function PageObservationTab({ data }: PageObservationTabProps) {
  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      {data.items.map((item) => (
        <article key={item.url} className="bh-observationItem bh-detailPanel">
          <header>
            <h3>{item.title || 'Untitled page'}</h3>
            <span>{item.currentDomain}</span>
          </header>
          <dl>
            <div>
              <dt>URL</dt>
              <dd>{item.url}</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>{item.origin}</dd>
            </div>
            <div>
              <dt>可见文本摘要</dt>
              <dd>{item.visibleTextSummary}</dd>
            </div>
            <div>
              <dt>页面状态</dt>
              <dd>{item.pageStateSummary}</dd>
            </div>
          </dl>
        </article>
      ))}
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}
