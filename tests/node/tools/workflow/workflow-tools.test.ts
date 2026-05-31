import { describe, expect, it } from 'vitest';

import {
  bhFlowDelete,
  bhFlowLookup,
  bhFlowPreview,
  bhFlowRunWithApproval,
  bhFlowSave,
  bhFlowScore
} from '../../../../src/tools/workflow/bh-flow-tools';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';

const rpc: ContentRpcClient = {
  request: async () => ({
    ok: false,
    code: 'UNUSED',
    message: 'unused'
  })
};

const ctx = { runId: 'run_workflow_tools', stepId: 'step_1', runMode: 'ask' as const };

describe('workflow tools', () => {
  it('saves, looks up, previews, requests approval, scores, and deletes workflows', async () => {
    const saved = await bhFlowSave(rpc).execute({
      domain: 'app.example.com',
      intent: 'Open billing report',
      taskDescription: 'Find monthly invoice',
      steps: [{
        id: 'step_1',
        tool: 'bh_page_observe',
        summary: 'Observe billing page',
        risk: 'safe',
        requiresApproval: false
      }]
    }, ctx);

    const workflowId = readData<{ workflow: { id: string } }>(saved).workflow.id;

    expect(readData<{ workflows: unknown[] }>(await bhFlowLookup(rpc).execute({
      domain: 'app.example.com',
      query: 'billing'
    }, ctx)).workflows).toHaveLength(1);

    expect(readData<{ preview: { workflowId: string } }>(
      await bhFlowPreview(rpc).execute({ id: workflowId }, ctx)
    ).preview.workflowId).toBe(workflowId);

    const approval = await bhFlowRunWithApproval(rpc).execute({ id: workflowId }, ctx);
    expect(approval.ok).toBe(false);
    expect(approval.requiresApproval).toBe(true);
    expect(approval.data).toBeDefined();

    expect(readData<{ workflow: { successCount: number } }>(
      await bhFlowScore(rpc).execute({ id: workflowId, outcome: 'success' }, ctx)
    ).workflow.successCount).toBe(1);

    expect(readData<{ deleted: boolean }>(
      await bhFlowDelete(rpc).execute({ id: workflowId }, ctx)
    ).deleted).toBe(true);
  });
});

function readData<T>(value: { data?: unknown }): T {
  return value.data as T;
}

