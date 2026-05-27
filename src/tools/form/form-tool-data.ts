import {
  disabledSubmitReasonSchema,
  formFieldSnapshotSchema,
  formSubmitSummarySchema,
  type FormFieldSnapshot,
  type FormSubmitSummary,
  type StructuredPageWarning,
  type TabDataStatus
} from '../../shared/schemas/structured-page-data.schema';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';

export type FormToolData = {
  status: Exclude<TabDataStatus, 'unsupported' | 'error'>;
  fields: FormFieldSnapshot[];
  submit?: FormSubmitSummary | undefined;
  warnings: StructuredPageWarning[];
};

export async function loadFormToolData(
  rpc: ContentRpcClient
): Promise<FormToolData | ToolResult> {
  const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
  if (!response.ok) {
    return failure(response.code, response.message, response.detail, true);
  }
  if (!('observation' in response)) {
    return failure(
      ERROR_CODES.FORM_FIELDS_UNAVAILABLE,
      'Content RPC did not return page observation',
      undefined,
      true
    );
  }
  const formFields = response.observation.formFields;
  if (typeof formFields !== 'object' || formFields === null) {
    return failure(
      ERROR_CODES.FORM_FIELDS_UNAVAILABLE,
      'Observation did not include form field snapshots',
      undefined,
      true
    );
  }

  const record = formFields as Record<string, unknown>;
  const fields = Array.isArray(record.fields)
    ? record.fields.map((field) => formFieldSnapshotSchema.parse(field))
    : [];
  const status =
    record.status === 'ready' || record.status === 'empty' || record.status === 'partial'
      ? record.status
      : 'partial';
  return {
    status,
    fields,
    submit:
      typeof record.submit === 'object' && record.submit !== null
        ? formSubmitSummarySchema.parse(record.submit)
        : fields[0]?.submit,
    warnings: Array.isArray(record.warnings)
      ? (record.warnings as StructuredPageWarning[])
      : []
  };
}

export function isToolResult(value: FormToolData | ToolResult): value is ToolResult {
  return 'ok' in value;
}

export function missingRequiredFields(fields: FormFieldSnapshot[]): FormFieldSnapshot[] {
  return fields.filter(
    (field) =>
      field.required &&
      !field.disabled &&
      (field.valuePreview.length === 0 || field.valuePreview === 'empty')
  );
}

export function validationErrorFields(fields: FormFieldSnapshot[]): FormFieldSnapshot[] {
  return fields.filter(
    (field) => field.validation.valid === false || field.validation.ariaInvalid === true
  );
}

export function disabledSubmitReason(data: FormToolData) {
  const reason = data.submit?.reason ?? data.fields.find((field) => field.submit?.reason)?.submit?.reason;
  return reason
    ? disabledSubmitReasonSchema.parse(reason)
    : disabledSubmitReasonSchema.parse({
        kind: 'unknown',
        message: 'No disabled submit reason found'
      });
}

export function failure(
  code: string,
  message: string,
  detail: unknown,
  requiresObserve: boolean
): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
