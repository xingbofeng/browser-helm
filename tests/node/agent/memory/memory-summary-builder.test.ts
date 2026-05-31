import { describe, expect, it } from 'vitest';

import { buildMemoryPromptContext } from '../../../../src/agent/memory/memory-summary-builder';
import { MemoryRepo } from '../../../../src/storage/memory-repo';
import { ScratchpadRepo } from '../../../../src/storage/scratchpad-repo';
import { WorkflowRepo } from '../../../../src/storage/workflow-repo';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('buildMemoryPromptContext', () => {
  it('builds bounded memory, workflow, and scratchpad context for allowed domains', () => {
    const memoryRepo = new MemoryRepo();
    const workflowRepo = new WorkflowRepo();
    const scratchpadRepo = new ScratchpadRepo();
    memoryRepo.save({
      domain: 'app.example.com',
      task: 'Open billing',
      summary: 'Use Billing > Invoices'
    });
    workflowRepo.save({
      domain: 'app.example.com',
      intent: 'Open billing report',
      taskDescription: 'Navigate to invoices',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: 'Observe page',
        risk: 'safe',
        requiresApproval: false
      }]
    });
    scratchpadRepo.replace('run_1', 'Important current-run fact');

    const context = buildMemoryPromptContext({
      domain: 'app.example.com',
      task: 'Open billing',
      runId: 'run_1',
      memoryRepo,
      workflowRepo,
      scratchpadRepo
    });

    expect(context?.permission.allowed).toBe(true);
    expect(context?.memoryHits[0]?.summary).toBe('Use Billing > Invoices');
    expect(context?.workflowHits[0]?.intent).toBe('Open billing report');
    expect(context?.scratchpad?.content).toBe('Important current-run fact');
  });

  it('returns permission reason without hits when domain policy denies memory', () => {
    const context = buildMemoryPromptContext({
      domain: 'secure.bank.example',
      task: 'Open account',
      runId: 'run_1',
      memoryRepo: new MemoryRepo(),
      workflowRepo: new WorkflowRepo(),
      scratchpadRepo: new ScratchpadRepo()
    });

    expect(context).toMatchObject({
      permission: {
        allowed: false,
        reason: 'DOMAIN_RESTRICTED'
      },
      memoryHits: [],
      workflowHits: []
    });
  });
});

