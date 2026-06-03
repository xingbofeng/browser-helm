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

  it('stores replay preconditions and surfaces unmet preview evidence', () => {
    const repo = new WorkflowRepo();
    const workflow = repo.save({
      domain: 'app.example.com',
      origin: 'https://app.example.com',
      urlPattern: 'https://app.example.com/billing/*',
      requiredPageTitleHints: ['Billing'],
      requiredPageTextHints: ['Monthly invoice'],
      keyRefHints: [{ role: 'button', name: 'Download invoice', locator: 'button.download' }],
      toolManifestHash: 'manifest_v1',
      adapter: { id: 'billing', version: '2026.06' },
      completionEvidence: ['Downloaded monthly invoice'],
      intent: 'Download monthly invoice',
      taskDescription: 'Open billing and download the monthly invoice',
      steps: [{
        id: 'step_1',
        tool: 'bh_page_observe',
        summary: 'Observe billing page',
        risk: 'safe',
        requiresApproval: false
      }]
    });

    expect(workflow).toMatchObject({
      domain: 'app.example.com',
      origin: 'https://app.example.com',
      urlPattern: 'https://app.example.com/billing/*',
      requiredPageTitleHints: ['Billing'],
      requiredPageTextHints: ['Monthly invoice'],
      keyRefHints: [{ role: 'button', name: 'Download invoice', locator: 'button.download' }],
      toolManifestHash: 'manifest_v1',
      adapter: { id: 'billing', version: '2026.06' },
      completionEvidence: ['Downloaded monthly invoice']
    });

    const preview = repo.preview(workflow.id, {
      url: 'https://app.example.com/settings',
      title: 'Settings',
      visibleTextSummary: 'Profile',
      refs: [{ role: 'link', name: 'Settings' }],
      toolManifestHash: 'manifest_v2',
      adapter: { id: 'billing', version: '2026.07' }
    });

    expect(preview?.unmetPreconditions).toEqual(expect.arrayContaining([
      'url_pattern',
      'required_title',
      'required_text',
      'key_ref',
      'tool_manifest_hash',
      'adapter_version'
    ]));
  });

  it('redacts secret-looking workflow args and tags before storage', () => {
    const repo = new WorkflowRepo();
    const workflow = repo.save({
      domain: 'app.example.com',
      completionEvidence: ['Invoice opened'],
      intent: 'Open invoice with token=sk-live-secret',
      taskDescription: 'Use provider api_key: provider-secret',
      steps: [{
        id: 'step_1',
        tool: 'bh_page_observe',
        summary: 'Observe with password: hunter2',
        args: {
          clipboardText: 'raw clipboard draft',
          token: 'sk-live-secret',
          fieldValue: '4111111111111111'
        },
        argsPreview: {
          otp: '123456'
        },
        risk: 'safe',
        requiresApproval: false
      }]
    });

    const serialized = JSON.stringify(workflow);
    expect(serialized).not.toContain('sk-live-secret');
    expect(serialized).not.toContain('provider-secret');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('raw clipboard draft');
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('123456');
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
