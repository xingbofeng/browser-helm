import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { ApprovalRequest } from '../../shared/schemas/approval.schema';
import { jsonPreview } from '../lib/format-tool';
import { ApprovalRiskBadge } from './approval-risk-badge';
import { StreamingMarkdown } from '../components/streaming-markdown';

type ApprovalDrawerProps = {
  request?: ApprovalRequest | undefined;
  decision?: 'approved' | 'denied' | undefined;
  decisionError?: string | undefined;
  onFieldValueChange?: ((input: {
    fieldRefId: string;
    value: string;
  }) => Promise<void>) | undefined;
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalDrawer(props: ApprovalDrawerProps) {
  if (!props.request) {
    return null;
  }
  const submitPreview = readSubmitApprovalPreview(props.request.argsPreview);
  return (
    <aside className="bh-approvalDrawer" aria-label="Approval">
      <h2>Approval</h2>
      <ApprovalRiskBadge risk={props.request.risk} />
      <StreamingMarkdown content={props.request.reason} />
      {props.request.actionPreview ? <StreamingMarkdown content={props.request.actionPreview} /> : null}
      <p>{props.request.tool}</p>
      {submitPreview ? (
        <SubmitApprovalPreview
          preview={submitPreview}
          onFieldValueChange={props.onFieldValueChange}
        />
      ) : (
        <pre>{jsonPreview(props.request.argsPreview)}</pre>
      )}
      {props.decisionError ? <p role="alert">{props.decisionError}</p> : null}
      <button
        type="button"
        className="bh-approvalActionApprove"
        onClick={props.onApprove}
        disabled={props.decision === 'approved'}
      >
        Approve
      </button>
      <button
        type="button"
        className="bh-approvalActionDeny"
        onClick={props.onDeny}
        disabled={props.decision === 'denied'}
      >
        Deny
      </button>
    </aside>
  );
}

type SubmitApprovalFieldPreview = {
  fieldRefId: string;
  label: string;
  name?: string | undefined;
  type: string;
  valuePreview: string;
  isSensitive: boolean;
  skipped: boolean;
};

type SubmitApprovalPreviewData = {
  formName: string;
  submitMethod: string;
  verifyStatus: string;
  fieldCount: number;
  filledCount: number;
  skippedCount: number;
  riskExplanation: string;
  highRisk: boolean;
  fields: SubmitApprovalFieldPreview[];
  warnings: string[];
};

function SubmitApprovalPreview({
  preview,
  onFieldValueChange
}: {
  preview: SubmitApprovalPreviewData;
  onFieldValueChange?: ApprovalDrawerProps['onFieldValueChange'];
}) {
  const [revealed, setRevealed] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [applyingField, setApplyingField] = useState<string>();
  const [editError, setEditError] = useState<string>();
  const fieldText = `${preview.filledCount}/${preview.fieldCount} 已填写，${preview.skippedCount} 跳过`;

  return (
    <section className={preview.highRisk ? 'bh-submitApproval is-highRisk' : 'bh-submitApproval'}>
      <div className="bh-submitApprovalSummary">
        <strong>{preview.formName}</strong>
        <span>{preview.submitMethod} · verify {preview.verifyStatus}</span>
        <span>{fieldText}</span>
      </div>
      <p>{preview.riskExplanation}</p>
      <button
        type="button"
        className="bh-submitApprovalReveal"
        onClick={() => setRevealed((next) => !next)}
        aria-pressed={revealed}
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        {revealed ? '隐藏字段值' : '显示字段值'}
      </button>
      <ul className="bh-submitApprovalFields">
        {preview.fields.map((field, index) => (
          <li key={`${field.label}-${field.name ?? index}`}>
            <span>
              <strong>{field.label}</strong>
              {field.name ? <small>{field.name}</small> : null}
            </span>
            <code>{formatFieldValue(field, revealed)}</code>
            {revealed && !field.isSensitive && !field.skipped && onFieldValueChange ? (
              <span className="bh-submitApprovalEdit">
                <input
                  aria-label={`修改字段 ${field.label}`}
                  value={draftValues[field.fieldRefId] ?? field.valuePreview}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraftValues((values) => ({
                      ...values,
                      [field.fieldRefId]: value
                    }));
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = draftValues[field.fieldRefId] ?? field.valuePreview;
                    setApplyingField(field.fieldRefId);
                    setEditError(undefined);
                    void onFieldValueChange({
                      fieldRefId: field.fieldRefId,
                      value
                    })
                      .catch((error) => {
                        setEditError(error instanceof Error ? error.message : '字段修改失败');
                      })
                      .finally(() => setApplyingField(undefined));
                  }}
                  disabled={applyingField === field.fieldRefId}
                >
                  {applyingField === field.fieldRefId ? '应用中' : '应用字段修改'}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {editError ? <p role="alert">{editError}</p> : null}
      {preview.warnings.length > 0 ? (
        <ul className="bh-submitApprovalWarnings">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatFieldValue(field: SubmitApprovalFieldPreview, revealed: boolean): string {
  if (field.skipped) return 'skipped';
  if (!revealed || field.isSensitive) return '******';
  return field.valuePreview;
}

function readSubmitApprovalPreview(value: unknown): SubmitApprovalPreviewData | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) return undefined;

  const formName = readString(value.formName);
  const submitMethod = readString(value.submitMethod);
  const verifyStatus = readString(value.verifyStatus);
  const riskExplanation = readString(value.riskExplanation);
  if (!formName || !submitMethod || !verifyStatus || !riskExplanation) return undefined;

  return {
    formName,
    submitMethod,
    verifyStatus,
    fieldCount: readNumber(value.fieldCount),
    filledCount: readNumber(value.filledCount),
    skippedCount: readNumber(value.skippedCount),
    riskExplanation,
    highRisk: value.highRisk === true,
    fields: value.fields.flatMap(readSubmitApprovalField),
    warnings: Array.isArray(value.warnings) ? value.warnings.flatMap((warning) => readString(warning) ?? []) : []
  };
}

function readSubmitApprovalField(value: unknown): SubmitApprovalFieldPreview[] {
  if (!isRecord(value)) return [];
  const label = readString(value.label);
  const fieldRefId = readString(value.fieldRefId);
  const type = readString(value.type);
  const valuePreview = readString(value.valuePreview);
  if (!fieldRefId || !label || !type || !valuePreview) return [];
  return [{
    fieldRefId,
    label,
    name: readString(value.name),
    type,
    valuePreview,
    isSensitive: value.isSensitive === true,
    skipped: value.skipped === true
  }];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
