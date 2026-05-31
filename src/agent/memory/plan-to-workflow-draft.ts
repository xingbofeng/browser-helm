import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { RunSummary } from '../../shared/schemas/session-summary';
import { workflowDraftSchema, type WorkflowDraft, type WorkflowStep } from '../../shared/schemas/workflow';
import { sanitizeMemoryText } from './memory-write-policy';

export type BuildWorkflowDraftInput = {
  domain?: string | undefined;
  runSummary: RunSummary;
};

export function buildWorkflowDraft(input: BuildWorkflowDraftInput): WorkflowDraft | undefined {
  if (!input.domain || input.runSummary.outcome !== 'success' || input.runSummary.completionEvidence.length === 0) {
    return undefined;
  }

  const steps = input.runSummary.reusableSteps
    .filter((step) => step.tool && step.tool !== TOOL_NAMES.FLOW_RUN_WITH_APPROVAL)
    .map((step, index): WorkflowStep => ({
      id: `draft_step_${index + 1}`,
      tool: step.tool ?? 'unknown_tool',
      summary: sanitizeMemoryText(step.summary).value,
      risk: step.tool === TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL ? 'high' : 'low',
      requiresApproval: step.tool === TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
    }));

  if (!steps.length) {
    return undefined;
  }

  return workflowDraftSchema.parse({
    id: `draft_${input.runSummary.runId}`,
    domain: input.domain,
    intent: sanitizeMemoryText(input.runSummary.task).value,
    taskDescription: sanitizeMemoryText(input.runSummary.task).value,
    steps,
    completionEvidence: input.runSummary.completionEvidence.map((item) => sanitizeMemoryText(item).value),
    requiresPreview: true,
    requiresApproval: true,
    saved: false
  });
}

