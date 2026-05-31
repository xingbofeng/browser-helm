import { describe, expect, it } from 'vitest';

import { buildWorkflowDraft } from '../../../../src/agent/memory/plan-to-workflow-draft';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RunSummary } from '../../../../src/shared/schemas/session-summary';

describe('buildWorkflowDraft', () => {
  it('builds an unsaved preview-and-approval-gated draft from successful runs', () => {
    const draft = buildWorkflowDraft({
      domain: 'app.example.com',
      runSummary: runSummary('success')
    });

    expect(draft).toMatchObject({
      domain: 'app.example.com',
      requiresPreview: true,
      requiresApproval: true,
      saved: false
    });
    expect(draft?.steps).toHaveLength(1);
  });

  it('does not build drafts for failed runs or runs without completion evidence', () => {
    expect(buildWorkflowDraft({
      domain: 'app.example.com',
      runSummary: runSummary('failed')
    })).toBeUndefined();

    expect(buildWorkflowDraft({
      domain: 'app.example.com',
      runSummary: {
        ...runSummary('success'),
        completionEvidence: []
      }
    })).toBeUndefined();
  });
});

function runSummary(outcome: RunSummary['outcome']): RunSummary {
  return {
    runId: 'run_1',
    task: 'Open billing',
    outcome,
    keyFindings: ['Observed billing'],
    reusableSteps: [{
      stepId: 'step_1',
      tool: TOOL_NAMES.PAGE_OBSERVE,
      outcome: 'success',
      summary: 'Observed billing',
      completionEvidence: ['Observed billing']
    }],
    completionCriteria: ['Billing observed'],
    completionEvidence: ['Observed billing'],
    unmetCriteria: []
  };
}

