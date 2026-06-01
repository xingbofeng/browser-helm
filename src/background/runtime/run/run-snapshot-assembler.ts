import type { RunSnapshot, RuntimeEvent } from '../../../runtime/runtime-messages';
import type { Observation } from '../../../shared/schemas/observation.schema';
import type { ToolResult } from '../../../shared/schemas/tool-result.schema';
import type { TraceEvent } from '../../../shared/schemas/trace.schema';
import type { RunMode } from '../../../shared/schemas/tool.schema';
import { TOOL_NAMES } from '../../../shared/constants/tool-names';
import { TRACE_EVENT_NAMES } from '../../../shared/constants/event-names';
import { buildStructuredPageData } from '../../../page/structured/structured-page-data';
import { sanitizeSensitiveDetail } from '../../../shared/redaction';
import { resolveRunMode } from '../../../agent/modes/mode-system';
import { resolveRuntimeCapabilities } from '../../../runtime/capabilities/runtime-capabilities';
import { initializeGoalState } from '../../../agent/goal/goal-state';
import { buildPlanState } from '../../../agent/planning/plan-builder';
import { t } from '../../../i18n/t';
import type { Locale } from '../../../i18n/types';
import { defaultDomainAdapterRegistry } from '../../../adapters/registry';
import {
  buildDebugReport,
  buildFormDoctorFindings,
  buildPageHealthFindings
} from '../../../agent/report/findings-report';

/**
 * Builds a RunSnapshot from an observe tool result.
 * Returns 'observed' when refs > 0, 'empty' when refs = 0, 'error' on failure.
 */
export function snapshotFromObserveResult(
  runId: string,
  mode: RunMode,
  result: ToolResult,
  trace: RuntimeEvent[]
): RunSnapshot {
  const toolResult = {
    tool: TOOL_NAMES.PAGE_OBSERVE,
    ok: result.ok,
    code: result.code,
    summary: result.summary
  };

  if (!result.ok) {
    return {
      runId,
      mode,
      status: 'error',
      refs: [],
      toolResult,
      error: {
        code: result.code,
        message: result.error?.message ?? result.summary
      },
      trace
    };
  }

  const observation = result.data as Observation;
  const refs = observation.refSummary;
  const structuredPageData = buildStructuredPageData(observation);
  return {
    runId,
    mode,
    status: refs.length > 0 ? 'observed' : 'empty',
    observation: {
      url: observation.url,
      title: observation.title,
      currentDomain: observation.currentDomain,
      origin: observation.origin,
      visibleTextSummary: observation.visibleTextSummary,
      pageStateSummary: observation.pageStateSummary,
      interactiveCount: refs.length,
      warnings: observation.warnings
    },
    refs,
    structuredPageData,
    domainAdapter: buildDomainAdapterSnapshot(observation.url),
    toolResult,
    trace
  };
}

/**
 * Extracts snapshot fields from a trace of agent events.
 */
export function extractSnapshotFields(trace: TraceEvent[]): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'recovery'
  | 'findings'
  | 'debugReport'
> {
  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'recovery'
    | 'findings'
    | 'debugReport'
  > = {};

  for (const event of trace) {
    if (event.type === TRACE_EVENT_NAMES.TASK_CLASSIFIED) {
      fields.classification = event.payload.classification;
      fields.modeReason = event.payload.classification.reason;
    }
    if (event.type === TRACE_EVENT_NAMES.CAPABILITIES_RESOLVED) {
      fields.capabilities = event.payload.capabilities;
      fields.capabilityLimitations = event.payload.limitations;
    }
    if (event.type === TRACE_EVENT_NAMES.PLAN_UPDATED) {
      fields.plan = event.payload.plan;
      if (event.payload.goal) {
        fields.goal = event.payload.goal;
      }
    }
    if (event.type === TRACE_EVENT_NAMES.RECOVERY_ACTION) {
      fields.recovery = event.payload.recovery;
    }
    if (event.type === TRACE_EVENT_NAMES.FINDINGS_REPORTED) {
      fields.findings = event.payload.findings;
    }
    if (event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED) {
      fields.debugReport = event.payload.report;
    }
  }

  return fields;
}

/**
 * Generates fallback snapshot fields when the diagnostic agent call fails or times out.
 */
export function fallbackSnapshotFields(
  mode: RunMode,
  observeResult: ToolResult,
  locale: Locale,
): Pick<
  RunSnapshot,
  | 'classification'
  | 'modeReason'
  | 'capabilities'
  | 'capabilityLimitations'
  | 'goal'
  | 'plan'
  | 'findings'
  | 'debugReport'
> {
  const task = mode === 'form' ? t('diagnosis.task.diagnoseForm', locale) : t('diagnosis.task.inspectPage', locale);
  const resolvedMode = resolveRunMode({
    locale,
    task,
    explicitMode: mode
  });
  const capabilities = resolveRuntimeCapabilities({
    hasActiveTab: true,
    hasDebuggerPermission: true,
    hasClipboardPermission: true,
    hasDownloadsPermission: true,
    shallowDebugAvailable: true
  });
  const goal = initializeGoalState({
    locale,
    task,
    mode
  });
  const plan = buildPlanState({
    id: `plan_fallback_${Date.now().toString(36)}`,
    mode,
    task,
    updatedAt: Date.now(),
    locale
  });

  const fields: Pick<
    RunSnapshot,
    | 'classification'
    | 'modeReason'
    | 'capabilities'
    | 'capabilityLimitations'
    | 'goal'
    | 'plan'
    | 'findings'
    | 'debugReport'
  > = {
    classification: resolvedMode.classification,
    modeReason: resolvedMode.reason,
    capabilities,
    capabilityLimitations: [],
    goal,
    plan
  };

  if (mode === 'form' && observeResult.ok) {
    const observation = observeResult.data as Observation;
    const formData = readFormDataFromObservation(observation);
    const findings = buildFormDoctorFindings(formData, locale);
    fields.findings = findings;
    fields.debugReport = buildDebugReport({
      title: t('diagnosis.title.formDoctor', locale),
      findings,
      recommendations: findings.length > 0 ? [t('diagnosis.recommendation.handleFindings', locale)] : []
    });
  }
  if (mode === 'debug') {
    const observation = observeResult.ok ? observeResult.data as Observation : undefined;
    const pageHealth = observation?.pageHealth;
    const findings = pageHealth ? buildPageHealthFindings(pageHealth, locale) : [];
    fields.debugReport = buildDebugReport({
      title: t('diagnosis.title.pageInspector', locale),
      findings,
      recommendations: findings.length > 0 ? [t('diagnosis.recommendation.handleFindings', locale)] : [],
      limitations: pageHealth?.limitations ?? [t('diagnosis.noDebugSignal', locale)]
    });
    fields.findings = findings;
  }

  return fields;
}

function readFormDataFromObservation(observation: Observation): Parameters<
  typeof buildFormDoctorFindings
>[0] {
  const record =
    typeof observation.formFields === 'object' && observation.formFields !== null
      ? observation.formFields as Record<string, unknown>
      : {};
  return {
    fields: Array.isArray(record.fields) ? record.fields as never : [],
    submit:
      typeof record.submit === 'object' && record.submit !== null
        ? record.submit as never
        : undefined,
    warnings: Array.isArray(record.warnings) ? record.warnings as never : []
  };
}

export function buildDomainAdapterSnapshot(url: string): RunSnapshot['domainAdapter'] {
  const detection = defaultDomainAdapterRegistry.detect(url);
  if (!detection.enabled) {
    return {
      enabled: false,
      fallback: detection.fallback,
      reason: detection.reason,
      ...(detection.disabledAdapter
        ? {
            disabledAdapter: {
              id: detection.disabledAdapter.id,
              label: detection.disabledAdapter.label
            }
          }
        : {})
    };
  }
  return {
    enabled: true,
    id: detection.adapter.id,
    label: detection.adapter.label,
    workflowCount: detection.adapter.workflows.length,
    locatorCount: detection.adapter.locators.length,
    approvalEnforced: true
  };
}

/**
 * Creates a snapshot tool result from a ToolResult, sanitizing sensitive detail.
 */
export function snapshotToolResult(
  tool: string,
  result: ToolResult
): NonNullable<RunSnapshot['toolResult']> {
  return {
    tool,
    ok: result.ok,
    code: result.code,
    summary: result.summary,
    detail: sanitizeToolResultDetail(result),
    changedPage: result.changedPage,
    requiresObserve: result.requiresObserve,
    requiresApproval: result.requiresApproval
  };
}

/**
 * Sanitizes the detail portion of a ToolResult for snapshot storage.
 */
export function sanitizeToolResultDetail(result: ToolResult): unknown {
  return sanitizeSensitiveDetail({
    data: result.data,
    error: result.error,
    approval: result.approval
  });
}
