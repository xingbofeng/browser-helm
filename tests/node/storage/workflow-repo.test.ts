import { describe, expect, it } from 'vitest';

import { WorkflowRepo } from '../../../src/storage/workflow-repo';
import type { WorkflowRepoPersistence } from '../../../src/storage/browser-helm-db';

describe('WorkflowRepo', () => {
  it('saves, previews, scores, and deletes workflow memory', () => {
    const repo = new WorkflowRepo();
    const workflow = repo.save({
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
    });

    expect(repo.lookup({ domain: 'app.example.com', query: 'billing' })[0]?.id).toBe(workflow.id);
    expect(repo.preview(workflow.id)).toMatchObject({
      workflowId: workflow.id,
      requiresApproval: true,
      highRisk: false
    });
    expect(repo.score(workflow.id, 'success')?.successCount).toBe(1);
    expect(repo.delete(workflow.id)).toBe(true);
  });

  it('marks approval-gated workflows high risk in replay preview', () => {
    const repo = new WorkflowRepo();
    const workflow = repo.save({
      domain: 'app.example.com',
      intent: 'Submit form',
      taskDescription: 'Submit the completed form',
      steps: [{
        id: 'step_1',
        tool: 'bh_form_submit_with_approval',
        summary: 'Submit final form',
        risk: 'high',
        requiresApproval: true,
        argsPreview: { password: 'hunter2' }
      }]
    });

    const preview = repo.preview(workflow.id);
    expect(preview?.highRisk).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('hunter2');
  });

  it('mirrors workflow changes to persistence', async () => {
    const putIds: string[] = [];
    const deletedIds: string[] = [];
    const persistence: WorkflowRepoPersistence = {
      load: async () => [],
      put: async (workflow) => {
        putIds.push(workflow.id);
      },
      delete: async (id) => {
        deletedIds.push(id);
      }
    };
    const repo = new WorkflowRepo(persistence);
    const workflow = repo.save({
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
    });

    repo.score(workflow.id, 'success');
    repo.delete(workflow.id);
    await Promise.resolve();

    expect(putIds).toEqual([workflow.id, workflow.id]);
    expect(deletedIds).toEqual([workflow.id]);
  });
});
