import { describe, expect, it, vi } from 'vitest';

import { ProviderService } from '../../../src/background/runtime/provider-service';
import { DomainPolicyService } from '../../../src/background/runtime/domain-policy-service';
import { MemoryWorkflowService } from '../../../src/background/runtime/memory-workflow-service';
import { ToolExecutionFacade } from '../../../src/background/runtime/tool-execution-facade';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import { TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';
import type { SettingsStore } from '../../../src/storage/interfaces/settings-store';
import { MemoryRepo } from '../../../src/storage/memory-repo';
import { WorkflowRepo } from '../../../src/storage/workflow-repo';
import type {
  MemoryRepoPersistence,
  WorkflowRepoPersistence
} from '../../../src/storage/browser-helm-db';
import type { MemoryEntry } from '../../../src/shared/schemas/memory';
import type { WorkflowMemory } from '../../../src/shared/schemas/workflow';

describe('runtime focused services', () => {
  it('ProviderService tests provider settings and creates a vision client only when credentials exist', async () => {
    const complete = vi.fn(async () => ({ text: 'ok' }));
    const testConnection = vi.fn(async () => ({ ok: true, model: 'demo-model' }));
    const settingsStore = settingsStoreWithProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'demo-model'
    });
    const service = new ProviderService({
      settingsStore,
      createProviderModelClient: vi.fn(() => ({ complete })),
      createProviderClient: vi.fn(() => ({ complete, testConnection }) as never)
    });

    await expect(service.testProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      apiKey: 'sk-test'
    })).resolves.toEqual({ ok: true, model: 'demo-model' });
    await expect(service.createVisionClient()).resolves.toBeDefined();
  });

  it('DomainPolicyService refreshes policy cache and keeps localhost memory reuse allowed', async () => {
    const service = new DomainPolicyService({
      settingsStore: {
        ...settingsStoreWithProvider(),
        getDomainPolicy: vi.fn(async () => ({
          defaultEnabled: false,
          enabledDomains: []
        }))
      }
    });

    expect(service.canExposeMemoryReuse('docs.example.com')).toBe(false);
    await service.refresh();

    expect(service.canExposeMemoryReuse('docs.example.com')).toBe(false);
    expect(service.canExposeMemoryReuse('localhost')).toBe(true);
    expect(service.canExposeMemoryReuse('127.0.0.1')).toBe(true);
  });

  it('MemoryWorkflowService enriches snapshots with memory entries, workflow previews, and unsaved workflow drafts', () => {
    const domain = `memory-service-${Date.now()}.example.com`;
    const memoryRepo = new MemoryRepo(memoryPersistence());
    const workflowRepo = new WorkflowRepo(workflowPersistence());
    memoryRepo.save({
      domain,
      task: '打开账单',
      summary: '账单入口在 Billing',
      tags: ['billing']
    });
    const workflow = workflowRepo.save({
      domain,
      intent: '打开账单',
      taskDescription: '进入 Billing',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: '观察页面',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const service = new MemoryWorkflowService({ memoryRepo, workflowRepo });

    const trace = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        summary: '确认 Billing 页面'
      }
    }];
    const snapshot = service.enrichSnapshot({
      snapshot: {
        runId: 'run_1',
        mode: 'ask',
        status: 'finished',
        observation: {
          url: `https://${domain}/billing`,
          title: 'Billing',
          currentDomain: domain,
          origin: `https://${domain}`,
          visibleTextSummary: 'Billing',
          pageStateSummary: 'Ready',
          interactiveCount: 0,
          warnings: []
        },
        goal: {
          goal: '打开账单',
          successCriteria: ['确认 Billing 页面'],
          satisfiedCriteria: ['确认 Billing 页面'],
          unsatisfiedCriteria: []
        },
        trace
      },
      record: {
        task: '打开账单',
        mode: 'ask',
        trace
      },
      canExposeMemoryReuse: true
    });

    expect(snapshot.memory).toMatchObject({
      domain,
      entries: [expect.objectContaining({ summary: '账单入口在 Billing' })],
      workflowPreviews: [expect.objectContaining({ workflowId: workflow.id })]
    });
    expect(snapshot.workflowDraft).toMatchObject({
      domain,
      intent: '打开账单',
      saved: false
    });
  });

  it('ToolExecutionFacade refreshes adapter and domain policy settings before delegating execution', async () => {
    const getDomainAdapterSettings = vi.fn(async () => ({ disabledAdapterIds: [] }));
    const refreshDomainPolicy = vi.fn(async () => undefined);
    const execute = vi.fn(async () => ({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'delegated',
      changedPage: false,
      requiresObserve: false
    }));
    const facade = new ToolExecutionFacade({
      settingsStore: {
        ...settingsStoreWithProvider(),
        getDomainAdapterSettings
      },
      refreshDomainPolicy,
      execute
    });

    const result = await facade.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'delegated'
    });
    expect(getDomainAdapterSettings).toHaveBeenCalledTimes(1);
    expect(refreshDomainPolicy).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    });
  });
});

function settingsStoreWithProvider(
  provider = {
    baseUrl: 'https://api.example.com/v1',
    model: 'demo-model',
    apiKey: 'sk-test'
  }
): SettingsStore {
  return {
    getProviderSettings: async () => provider,
    setProviderSettings: async () => undefined
  };
}

function memoryPersistence(): MemoryRepoPersistence {
  const entries: MemoryEntry[] = [];
  return {
    load: async () => entries,
    put: async (entry) => {
      const index = entries.findIndex((item) => item.id === entry.id);
      if (index >= 0) {
        entries[index] = entry;
        return;
      }
      entries.push(entry);
    },
    delete: async (id) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
    },
    clearDomain: async (domain) => {
      for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index]?.domain === domain) entries.splice(index, 1);
      }
    },
    clearAll: async () => {
      entries.length = 0;
    }
  };
}

function workflowPersistence(): WorkflowRepoPersistence {
  const workflows: WorkflowMemory[] = [];
  return {
    load: async () => workflows,
    put: async (workflow) => {
      const index = workflows.findIndex((item) => item.id === workflow.id);
      if (index >= 0) {
        workflows[index] = workflow;
      } else {
        workflows.push(workflow);
      }
    },
    delete: async (id) => {
      const index = workflows.findIndex((workflow) => workflow.id === id);
      if (index >= 0) workflows.splice(index, 1);
    }
  };
}
