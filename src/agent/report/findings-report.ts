import type {
  AgentFinding,
  Confidence,
  DebugReport,
  Evidence
} from '../../shared/schemas/diagnosis.schema';
import {
  agentFindingSchema,
  debugReportSchema
} from '../../shared/schemas/diagnosis.schema';
import type {
  FormFieldSnapshot,
  FormSubmitSummary,
  StructuredPageWarning
} from '../../shared/schemas/structured-page-data.schema';
import type { PageHealthSummary } from '../../shared/schemas/page-health.schema';

type BuildFindingInput = {
  title: string;
  explanation: string;
  evidence: Evidence[];
  inferred?: boolean;
};

type BuildDebugReportInput = {
  title: string;
  findings: AgentFinding[];
  recommendations: string[];
  limitations?: string[];
};

type BuildFormDoctorFindingsInput = {
  fields: FormFieldSnapshot[];
  submit?: FormSubmitSummary | undefined;
  warnings: Array<StructuredPageWarning | string>;
};

export function confidenceFromEvidence(
  evidence: Evidence[],
  inferred = false
): Confidence {
  if (evidence.length === 0) {
    return 'low';
  }
  return inferred ? 'medium' : 'high';
}

export function buildFinding(input: BuildFindingInput): AgentFinding {
  return agentFindingSchema.parse({
    title: input.title,
    explanation: input.explanation,
    evidence: input.evidence,
    confidence: confidenceFromEvidence(input.evidence, input.inferred)
  });
}

export function buildDebugReport(input: BuildDebugReportInput): DebugReport {
  return debugReportSchema.parse(input);
}

export function buildFormDoctorFindings(
  input: BuildFormDoctorFindingsInput
): AgentFinding[] {
  const findings: AgentFinding[] = [];
  const missingRequired = input.fields.filter(
    (field) =>
      field.required &&
      !field.disabled &&
      (field.valuePreview.length === 0 || field.valuePreview === 'empty')
  );
  if (missingRequired.length > 0) {
    findings.push(
      buildFinding({
        title: '必填字段为空',
        explanation: `发现 ${missingRequired.length} 个必填字段当前为空。`,
        evidence: missingRequired.map((field) => ({
          source: 'form',
          summary: fieldSummary(field, 'required empty'),
          refId: field.refId
        }))
      })
    );
  }

  const invalidFields = input.fields.filter(
    (field) => field.validation.valid === false || field.validation.ariaInvalid === true
  );
  if (invalidFields.length > 0) {
    findings.push(
      buildFinding({
        title: '字段校验失败',
        explanation: `发现 ${invalidFields.length} 个字段存在校验错误。`,
        evidence: invalidFields.map((field) => ({
          source: 'form',
          summary: fieldSummary(field, field.validation.message ?? 'invalid'),
          refId: field.refId
        }))
      })
    );
  }

  if (input.submit?.disabled) {
    const reason = input.submit.reason;
    findings.push(
      buildFinding({
        title: '提交按钮不可用',
        explanation: reason?.message ?? '提交按钮处于禁用状态，原因暂未确认。',
        evidence: [
          {
            source: reason?.kind === 'confirmed' ? 'form' : 'tool_result',
            summary: reason?.message ?? 'submit disabled',
            ...(reason?.fieldRefId ? { refId: reason.fieldRefId } : {})
          }
        ],
        inferred: reason?.kind !== 'confirmed'
      })
    );
  }

  return findings;
}

export function buildPageHealthFindings(input: PageHealthSummary): AgentFinding[] {
  const findings: AgentFinding[] = [];
  if (input.consoleErrors.length > 0) {
    findings.push(
      buildFinding({
        title: 'Console error',
        explanation: `发现 ${input.consoleErrors.length} 类 console error。`,
        evidence: input.consoleErrors.map((error) => ({
          source: 'debug',
          summary: `${error.source ? `${error.source}: ` : ''}${error.message} (${error.count} 次)`
        }))
      })
    );
  }

  if (input.networkFailures.length > 0) {
    findings.push(
      buildFinding({
        title: 'Network failure',
        explanation: `发现 ${input.networkFailures.length} 个 network failure。`,
        evidence: input.networkFailures.map((failure) => ({
          source: 'debug',
          summary: `${failure.method} ${failure.url}: ${failure.errorText}${failure.status ? ` (${failure.status})` : ''}`
        }))
      })
    );
  }

  return findings;
}

function fieldSummary(field: FormFieldSnapshot, detail: string): string {
  const label = field.label ?? field.name ?? field.refId;
  return `${label}: ${detail}`;
}
