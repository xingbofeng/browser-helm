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
  return (
    <TabDataStatusBlock status={data.status} summary={data.summary} count={data.count}>
      <ul>
        {data.items.map((item) => {
          const reason = item.submit?.reason;
          return (
            <li key={item.refId}>
              <code>{item.refId}</code> {item.label ?? item.name ?? '-'} {item.type}{' '}
              required={String(item.required)} disabled={String(item.disabled)} valid=
              {String(item.validation.valid)} valuePreview=
              {item.sensitive ? '[MASKED]' : item.valuePreview}
              {item.validation.message ? ` ${item.validation.message}` : ''}
              {reason ? ` ${confidenceLabel(reason)} ${reason.message}` : ''}
            </li>
          );
        })}
      </ul>
      {renderWarnings(data.warnings)}
    </TabDataStatusBlock>
  );
}

function confidenceLabel(reason: DisabledSubmitReason): string {
  return confidenceLabels[reason.kind];
}
