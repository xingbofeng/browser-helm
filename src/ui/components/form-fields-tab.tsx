import type { DisabledSubmitReason, StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import { renderWarnings, TabDataStatusBlock } from './tab-data-status';

type FormFieldsTabProps = {
  data: StructuredPageData['forms'];
};

const confidenceLabels: Record<DisabledSubmitReason['kind'], string> = {
  confirmed: '已确认',
  inferred: '推断',
  unknown: '无法判断'
};

export function FormFieldsTab({ data }: FormFieldsTabProps) {
  const requiredCount = data.items.filter((item) => item.required).length;
  const validCount = data.items.filter((item) => item.validation.valid).length;
  const blockedCount = data.items.filter((item) => item.submit?.disabled).length;
  const selectedItem =
    data.items.find((item) => !item.validation.valid || item.submit?.disabled) ?? data.items[0];

  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <div className="bh-metricGrid" aria-label="表单校验摘要">
        <MetricCard label="必填字段" value={`${requiredCount}/${requiredCount}`} meta="已填写" />
        <MetricCard label="校验通过" value={`${validCount}/${data.count}`} meta="通过" tone="success" />
        <MetricCard label="阻止提交" value={`${blockedCount}项`} meta={blockedCount > 0 ? '需修复' : '无阻塞'} tone={blockedCount > 0 ? 'danger' : 'success'} />
      </div>

      <div className="bh-dataTableWrap">
        <table className="bh-dataTable">
          <thead>
            <tr>
              <th>字段名 / 标签</th>
              <th>类型</th>
              <th>必填</th>
              <th>当前值</th>
              <th>校验状态</th>
              <th>错误信息</th>
              <th>ref_id</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const reason = item.submit?.reason;
              const selected = item.refId === selectedItem?.refId;
              return (
                <tr key={item.refId} className={selected ? 'is-selected' : undefined}>
                  <td>
                    <strong>{item.label ?? item.name ?? '-'}</strong>
                    <span>{item.name ?? '-'}</span>
                  </td>
                  <td>{item.type}</td>
                  <td>{item.required ? '是' : '-'}</td>
                  <td>{item.sensitive ? '[MASKED]' : item.valuePreview || '-'}</td>
                  <td>
                    <span className={`bh-statePill ${item.validation.valid ? 'is-success' : 'is-danger'}`}>
                      {item.validation.valid ? '通过' : '异常'}
                    </span>
                  </td>
                  <td>{item.validation.message ?? (reason ? `${confidenceLabel(reason)} ${reason.message}` : '-')}</td>
                  <td><code>{item.refId}</code></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedItem ? (
        <article className="bh-detailPanel">
          <header>
            <h3>字段详情</h3>
            <code>{selectedItem.refId}</code>
          </header>
          <dl>
            <div>
              <dt>标签</dt>
              <dd>{selectedItem.label ?? selectedItem.name ?? '-'}</dd>
            </div>
            <div>
              <dt>约束</dt>
              <dd>
                required={String(selectedItem.required)} disabled={String(selectedItem.disabled)}
              </dd>
            </div>
            <div>
              <dt>当前值</dt>
              <dd>{selectedItem.sensitive ? '[MASKED]' : selectedItem.valuePreview || '-'}</dd>
            </div>
            <div>
              <dt>提交原因</dt>
              <dd>
                {selectedItem.submit?.reason
                  ? `${confidenceLabel(selectedItem.submit.reason)} ${selectedItem.submit.reason.message}`
                  : '无阻塞'}
              </dd>
            </div>
          </dl>
        </article>
      ) : null}
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}

function confidenceLabel(reason: DisabledSubmitReason): string {
  return confidenceLabels[reason.kind];
}

function MetricCard(props: {
  label: string;
  value: string;
  meta: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className={`bh-metricCard ${props.tone ? `bh-metricCard-${props.tone}` : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.meta}</small>
    </div>
  );
}
