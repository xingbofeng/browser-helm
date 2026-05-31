import { sanitizeMemoryDetail, sanitizeMemoryText } from '../agent/memory/memory-write-policy';
import type { WorkflowMemory, WorkflowReplayPreview, WorkflowStep } from '../shared/schemas/workflow';
import {
  createIndexedDbWorkflowPersistence,
  type WorkflowRepoPersistence
} from './browser-helm-db';

export type SaveWorkflowInput = {
  domain: string;
  origin?: string | undefined;
  intent: string;
  taskDescription: string;
  steps: WorkflowStep[];
};

export class WorkflowRepo {
  private readonly workflows = new Map<string, WorkflowMemory>();

  constructor(private readonly persistence?: WorkflowRepoPersistence | undefined) {
    void this.hydrate();
  }

  save(input: SaveWorkflowInput): WorkflowMemory {
    const now = Date.now();
    const id = createId('flow');
    const workflow: WorkflowMemory = {
      id,
      domain: input.domain,
      ...(input.origin ? { origin: input.origin } : {}),
      intent: sanitizeMemoryText(input.intent).value,
      taskDescription: sanitizeMemoryText(input.taskDescription).value,
      steps: input.steps.map(sanitizeWorkflowStep),
      successCount: 0,
      failureCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.workflows.set(id, workflow);
    void this.persistence?.put(workflow);
    return workflow;
  }

  update(id: string, patch: Partial<Pick<WorkflowMemory, 'intent' | 'taskDescription' | 'steps' | 'successCount' | 'failureCount'>>): WorkflowMemory | undefined {
    const current = this.workflows.get(id);
    if (!current) {
      return undefined;
    }
    const next: WorkflowMemory = {
      ...current,
      ...(patch.intent ? { intent: sanitizeMemoryText(patch.intent).value } : {}),
      ...(patch.taskDescription ? { taskDescription: sanitizeMemoryText(patch.taskDescription).value } : {}),
      ...(patch.steps ? { steps: patch.steps.map(sanitizeWorkflowStep) } : {}),
      ...(patch.successCount !== undefined ? { successCount: patch.successCount } : {}),
      ...(patch.failureCount !== undefined ? { failureCount: patch.failureCount } : {}),
      updatedAt: Date.now()
    };
    this.workflows.set(id, next);
    void this.persistence?.put(next);
    return next;
  }

  get(id: string): WorkflowMemory | undefined {
    return this.workflows.get(id);
  }

  delete(id: string): boolean {
    const deleted = this.workflows.delete(id);
    if (deleted) {
      void this.persistence?.delete(id);
    }
    return deleted;
  }

  list(domain?: string): WorkflowMemory[] {
    return [...this.workflows.values()]
      .filter((workflow) => domain ? workflow.domain === domain : true)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  lookup(input: { domain: string; query?: string | undefined; limit?: number | undefined }): WorkflowMemory[] {
    const query = input.query?.toLowerCase().trim();
    const tokens = tokenize(query ?? '');
    return this.list(input.domain)
      .filter((workflow) => {
        if (!tokens.length) {
          return true;
        }
        const haystack = `${workflow.intent} ${workflow.taskDescription}`.toLowerCase();
        return tokens.some((token) => haystack.includes(token));
      })
      .slice(0, input.limit ?? 5);
  }

  preview(id: string): WorkflowReplayPreview | undefined {
    const workflow = this.get(id);
    if (!workflow) {
      return undefined;
    }
    const highRisk = workflow.steps.some((step) => step.risk === 'high' || step.requiresApproval);
    return {
      workflowId: workflow.id,
      domain: workflow.domain,
      intent: workflow.intent,
      stepCount: workflow.steps.length,
      highRisk,
      requiresApproval: true,
      steps: workflow.steps,
      warnings: highRisk
        ? ['Workflow contains high-risk or approval-gated steps.']
        : ['Workflow replay requires explicit user approval.']
    };
  }

  score(id: string, outcome: 'success' | 'failed'): WorkflowMemory | undefined {
    const current = this.workflows.get(id);
    if (!current) {
      return undefined;
    }
    return this.update(id, {
      successCount: current.successCount + (outcome === 'success' ? 1 : 0),
      failureCount: current.failureCount + (outcome === 'failed' ? 1 : 0)
    });
  }

  private async hydrate(): Promise<void> {
    const persisted = await this.persistence?.load();
    for (const workflow of persisted ?? []) {
      this.workflows.set(workflow.id, workflow);
    }
  }
}

export const defaultWorkflowRepo = new WorkflowRepo(createIndexedDbWorkflowPersistence());

function sanitizeWorkflowStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    summary: sanitizeMemoryText(step.summary).value,
    ...(step.args === undefined ? {} : { args: sanitizeMemoryDetail(step.args) }),
    ...(step.argsPreview === undefined ? {} : { argsPreview: sanitizeMemoryDetail(step.argsPreview) })
  };
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tokenize(value: string): string[] {
  const words = value.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((token) => token.length >= 2);
  const cjkBigrams = Array.from(value.matchAll(/[\p{Script=Han}]{2,}/gu))
    .flatMap((match) => bigrams(match[0] ?? ''));
  return [...new Set([...words, ...cjkBigrams])];
}

function bigrams(value: string): string[] {
  return Array.from(value).flatMap((_, index, chars) =>
    index + 1 < chars.length ? [`${chars[index]}${chars[index + 1]}`] : []
  );
}
