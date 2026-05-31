export type SubmitApprovalFieldPreview = {
  fieldRefId: string;
  label: string;
  name?: string | undefined;
  type?: string | undefined;
  valuePreview: string;
  isSensitive: boolean;
  skipped: boolean;
};

export type SubmitApprovalPreviewData = {
  formName: string;
  submitMethod: string;
  verifyStatus: string;
  fieldCount: number;
  filledCount: number;
  skippedCount: number;
  riskExplanation?: string | undefined;
  highRisk: boolean;
  fields: SubmitApprovalFieldPreview[];
  warnings: string[];
  submitTargetRefId?: string | undefined;
};

export function readSubmitApprovalPreview(value: unknown): SubmitApprovalPreviewData | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return undefined;
  }

  const formName = readString(value.formName);
  const submitMethod = readString(value.submitMethod);
  const verifyStatus = readString(value.verifyStatus);
  const riskExplanation = readString(value.riskExplanation);
  if (!formName || !submitMethod || !verifyStatus || !riskExplanation) {
    return undefined;
  }

  const fields = value.fields.flatMap((field) =>
    readSubmitApprovalField(field, { requireType: true, requireValuePreview: true })
  );

  return {
    formName,
    submitMethod,
    verifyStatus,
    fieldCount: readNumber(value.fieldCount),
    filledCount: readNumber(value.filledCount),
    skippedCount: readNumber(value.skippedCount),
    riskExplanation,
    highRisk: value.highRisk === true,
    fields,
    warnings: readStringArray(value.warnings)
  };
}

export function readEditableSubmitApprovalArgs(value: unknown): SubmitApprovalPreviewData | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields = Array.isArray(value.fields)
    ? value.fields.flatMap((field) => readSubmitApprovalField(field))
    : [];
  if (!fields.length) {
    return undefined;
  }

  const riskExplanation = readString(value.riskExplanation);
  const submitTargetRefId = readString(value.submitTargetRefId);
  return {
    formName: readString(value.formName) ?? 'Unknown form',
    fieldCount: readNumber(value.fieldCount),
    filledCount: readNumber(value.filledCount),
    skippedCount: readNumber(value.skippedCount),
    fields,
    verifyStatus: readString(value.verifyStatus) ?? 'unknown',
    submitMethod: readSubmitMethod(value.submitMethod) ?? 'unknown',
    warnings: readStringArray(value.warnings),
    highRisk: Boolean(value.highRisk),
    ...(riskExplanation ? { riskExplanation } : {}),
    ...(submitTargetRefId ? { submitTargetRefId } : {})
  };
}

function readSubmitApprovalField(
  value: unknown,
  options: { requireType?: boolean; requireValuePreview?: boolean } = {}
): SubmitApprovalFieldPreview[] {
  if (!isRecord(value)) {
    return [];
  }
  const label = readString(value.label);
  const fieldRefId = readString(value.fieldRefId);
  const type = readString(value.type);
  const valuePreview = readString(value.valuePreview);
  if (!fieldRefId || !label || (options.requireType && !type) || (options.requireValuePreview && !valuePreview)) {
    return [];
  }
  const name = readString(value.name);
  return [{
    fieldRefId,
    label,
    valuePreview: valuePreview ?? '',
    isSensitive: value.isSensitive === true,
    skipped: value.skipped === true,
    ...(type ? { type } : {}),
    ...(name ? { name } : {})
  }];
}

function readSubmitMethod(value: unknown): SubmitApprovalPreviewData['submitMethod'] | undefined {
  return value === 'button-click' || value === 'enter-submit' ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => readString(item) ?? [])
    : [];
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
