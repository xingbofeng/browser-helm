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
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';

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
  input: BuildFormDoctorFindingsInput,
  locale: Locale = 'zh',
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
        title: t('finding.title.requiredEmpty', locale),
        explanation: t('finding.explanation.requiredEmpty', locale, {
          count: String(missingRequired.length),
        }),
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
        title: t('finding.title.validationFailed', locale),
        explanation: t('finding.explanation.validationFailed', locale, {
          count: String(invalidFields.length),
        }),
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
        title: t('finding.title.submitDisabled', locale),
        explanation: reason?.message ?? t('finding.explanation.submitDisabledFallback', locale),
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

export function buildPageHealthFindings(input: PageHealthSummary, locale: Locale = 'zh'): AgentFinding[] {
  const findings: AgentFinding[] = [];
  if (input.consoleErrors.length > 0) {
    findings.push(
      buildFinding({
        title: t('finding.title.consoleError', locale),
        explanation: t('finding.explanation.consoleError', locale, {
          count: String(input.consoleErrors.length),
        }),
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
        title: t('finding.title.networkFailure', locale),
        explanation: t('finding.explanation.networkFailure', locale, {
          count: String(input.networkFailures.length),
        }),
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
