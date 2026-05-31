import { describe, expect, it } from 'vitest';

import { workflowMemorySchema, workflowReplayPreviewSchema, workflowStepSchema } from '../../../../src/shared/schemas/workflow';

describe('workflow schemas', () => {
  it('defaults step risk and approval metadata', () => {
    const step = workflowStepSchema.parse({
      id: 'step_1',
      tool: 'bh_page_observe',
      summary: 'Observe current page'
    });

    expect(step.risk).toBe('safe');
    expect(step.requiresApproval).toBe(false);
  });

  it('validates workflow memory and replay preview payloads', () => {
    const step = workflowStepSchema.parse({
      id: 'step_1',
      tool: 'bh_page_observe',
      summary: 'Observe current page'
    });
    const workflow = workflowMemorySchema.parse({
      id: 'flow_1',
      domain: 'example.com',
      intent: 'Open billing report',
      taskDescription: 'Find the monthly billing report',
      steps: [step],
      createdAt: 1,
      updatedAt: 1
    });

    expect(workflow.steps).toHaveLength(1);
    expect(workflowReplayPreviewSchema.parse({
      workflowId: workflow.id,
      domain: workflow.domain,
      intent: workflow.intent,
      stepCount: workflow.steps.length,
      highRisk: false,
      requiresApproval: true,
      steps: workflow.steps,
      warnings: ['Workflow replay requires explicit user approval.']
    }).requiresApproval).toBe(true);
  });
});

